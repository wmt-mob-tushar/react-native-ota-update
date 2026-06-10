//
//  OTAModule.m
//  OTA Platform — iOS native module
//
//  Bundle state lives in native-owned NSUserDefaults (ota.* keys), NOT in
//  AsyncStorage: AsyncStorage's on-disk format is an implementation detail
//  and cannot be read reliably before the bridge exists. The JS SDK writes
//  through to this module (setPendingBundle / markSuccess / setBundleState)
//  and keeps its own AsyncStorage mirror for UI purposes.
//
//  Crash-window boot protection (native-owned):
//   - +bundleURL increments ota.bootAttempts before booting an OTA bundle.
//     A successful launch calls markSuccess(), which resets it.
//   - If bootAttempts reaches kMaxBootAttempts, the previous launches crashed
//     before JS could run: fall back one tier (pending → current → lastGood →
//     embedded) and record ota.rollbackReason for the JS SDK to report.
//

#import "OTAModule.h"
#import <React/RCTLog.h>
#import <React/RCTReloadCommand.h>

static NSString *const kCurrentPath    = @"ota.currentPath";
static NSString *const kCurrentId      = @"ota.currentId";
static NSString *const kPendingPath    = @"ota.pendingPath";
static NSString *const kPendingId      = @"ota.pendingId";
static NSString *const kLastGoodPath   = @"ota.lastGoodPath";
static NSString *const kLastGoodId     = @"ota.lastGoodId";
static NSString *const kBootAttempts   = @"ota.bootAttempts";
static NSString *const kRollbackReason = @"ota.rollbackReason";
static NSString *const kRollbackFromId = @"ota.rollbackFromId";

// Boots without a markSuccess() before the bundle is considered bad.
static const NSInteger kMaxBootAttempts = 2;

@implementation OTAModule

RCT_EXPORT_MODULE(OTAModule);

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

// ─────────────────────────────────────────────────────────────
// Boot path — called from AppDelegate (sourceURLForBridge / bundleURL)
// ─────────────────────────────────────────────────────────────

+ (nullable NSURL *)bundleURL {
    @try {
        NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];

        if ([defaults integerForKey:kBootAttempts] >= kMaxBootAttempts) {
            [OTAModule fallbackOneTier:defaults];
        }

        NSString *path = [OTAModule selectBootPath:defaults];
        if (!path) {
            // Embedded bundle is always safe — no crash window needed.
            [defaults setInteger:0 forKey:kBootAttempts];
            RCTLogInfo(@"[OTA] No OTA bundle staged — using embedded bundle");
            return nil;
        }

        // Tentative boot: if the app crashes before markSuccess(), this
        // counter survives and the next boot falls back a tier.
        [defaults setInteger:[defaults integerForKey:kBootAttempts] + 1
                      forKey:kBootAttempts];
        [defaults synchronize];

        RCTLogInfo(@"[OTA] Loading OTA bundle: %@", path);
        return [NSURL fileURLWithPath:path];

    } @catch (NSException *exception) {
        RCTLogError(@"[OTA] bundleURL exception: %@", exception.reason);
        return nil;
    }
}

+ (nullable NSURL *)bundleURLForBridge:(RCTBridge *)bridge {
    return [OTAModule bundleURL];
}

// pending → current → nil, dropping tiers whose files are missing.
+ (nullable NSString *)selectBootPath:(NSUserDefaults *)defaults {
    NSFileManager *fm = [NSFileManager defaultManager];

    NSString *pending = [defaults stringForKey:kPendingPath];
    if (pending.length > 0) {
        if ([fm fileExistsAtPath:pending]) return pending;
        [defaults removeObjectForKey:kPendingPath];
        [defaults removeObjectForKey:kPendingId];
    }

    NSString *current = [defaults stringForKey:kCurrentPath];
    if (current.length > 0) {
        if ([fm fileExistsAtPath:current]) return current;
        [defaults removeObjectForKey:kCurrentPath];
        [defaults removeObjectForKey:kCurrentId];
    }

    return nil;
}

// The active tier crashed repeatedly before JS could mark success.
// Discard it, record why, and reset the boot counter.
+ (void)fallbackOneTier:(NSUserDefaults *)defaults {
    NSString *pendingPath = [defaults stringForKey:kPendingPath];

    if (pendingPath.length > 0) {
        NSString *pendingId = [defaults stringForKey:kPendingId];
        [defaults removeObjectForKey:kPendingPath];
        [defaults removeObjectForKey:kPendingId];
        [defaults setObject:@"Pending bundle crashed during launch (crash-window rollback)"
                     forKey:kRollbackReason];
        if (pendingId) [defaults setObject:pendingId forKey:kRollbackFromId];
        RCTLogWarn(@"[OTA] Crash-window: discarding pending bundle %@", pendingId);
    } else {
        NSString *currentId    = [defaults stringForKey:kCurrentId];
        NSString *lastGoodPath = [defaults stringForKey:kLastGoodPath];
        NSString *lastGoodId   = [defaults stringForKey:kLastGoodId];

        if (lastGoodPath.length > 0 &&
            [[NSFileManager defaultManager] fileExistsAtPath:lastGoodPath]) {
            [defaults setObject:lastGoodPath forKey:kCurrentPath];
            if (lastGoodId) [defaults setObject:lastGoodId forKey:kCurrentId];
            else            [defaults removeObjectForKey:kCurrentId];
            [defaults removeObjectForKey:kLastGoodPath];
            [defaults removeObjectForKey:kLastGoodId];
        } else {
            [defaults removeObjectForKey:kCurrentPath];
            [defaults removeObjectForKey:kCurrentId];
        }
        [defaults setObject:@"Current bundle crashed during launch (crash-window rollback)"
                     forKey:kRollbackReason];
        if (currentId) [defaults setObject:currentId forKey:kRollbackFromId];
        RCTLogWarn(@"[OTA] Crash-window: rolling back current bundle %@", currentId);
    }

    [defaults setInteger:0 forKey:kBootAttempts];
    [defaults synchronize];
}

// ─────────────────────────────────────────────────────────────
// JS-exposed methods
// ─────────────────────────────────────────────────────────────

/** Stage a downloaded bundle; it boots (tentatively) on next launch. */
RCT_EXPORT_METHOD(setPendingBundle:(NSString *)bundleId
                  path:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    [defaults setObject:bundleId forKey:kPendingId];
    [defaults setObject:path     forKey:kPendingPath];
    [defaults synchronize];
    resolve(nil);
}

/**
 * The app launched successfully: reset the crash window and promote
 * pending → current (previous current becomes lastGood).
 * Resolves @YES if a pending bundle was promoted.
 */
RCT_EXPORT_METHOD(markSuccess:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    BOOL promoted = NO;

    NSString *pendingPath = [defaults stringForKey:kPendingPath];
    if (pendingPath.length > 0) {
        NSString *pendingId = [defaults stringForKey:kPendingId];
        NSString *curPath   = [defaults stringForKey:kCurrentPath];
        NSString *curId     = [defaults stringForKey:kCurrentId];

        if (curPath) [defaults setObject:curPath forKey:kLastGoodPath];
        else         [defaults removeObjectForKey:kLastGoodPath];
        if (curId)   [defaults setObject:curId forKey:kLastGoodId];
        else         [defaults removeObjectForKey:kLastGoodId];

        [defaults setObject:pendingPath forKey:kCurrentPath];
        if (pendingId) [defaults setObject:pendingId forKey:kCurrentId];
        else           [defaults removeObjectForKey:kCurrentId];
        [defaults removeObjectForKey:kPendingPath];
        [defaults removeObjectForKey:kPendingId];
        promoted = YES;
    }

    [defaults setInteger:0 forKey:kBootAttempts];
    [defaults synchronize];
    resolve(@(promoted));
}

/**
 * Snapshot of the native bundle state. rollbackReason / rollbackFromId are
 * consumed (cleared) by this call so a rollback is reported exactly once.
 */
RCT_EXPORT_METHOD(getState:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    NSDictionary *state = @{
        @"currentId":      [defaults stringForKey:kCurrentId]      ?: [NSNull null],
        @"currentPath":    [defaults stringForKey:kCurrentPath]    ?: [NSNull null],
        @"pendingId":      [defaults stringForKey:kPendingId]      ?: [NSNull null],
        @"pendingPath":    [defaults stringForKey:kPendingPath]    ?: [NSNull null],
        @"lastGoodId":     [defaults stringForKey:kLastGoodId]     ?: [NSNull null],
        @"lastGoodPath":   [defaults stringForKey:kLastGoodPath]   ?: [NSNull null],
        @"bootAttempts":   @([defaults integerForKey:kBootAttempts]),
        @"rollbackReason": [defaults stringForKey:kRollbackReason] ?: [NSNull null],
        @"rollbackFromId": [defaults stringForKey:kRollbackFromId] ?: [NSNull null],
    };
    [defaults removeObjectForKey:kRollbackReason];
    [defaults removeObjectForKey:kRollbackFromId];
    [defaults synchronize];
    resolve(state);
}

/**
 * Overwrite parts of the bundle state (manual rollback, clear-to-embedded).
 * Recognised keys: currentId, currentPath, pendingId, pendingPath,
 * lastGoodId, lastGoodPath. A null value removes the key.
 */
RCT_EXPORT_METHOD(setBundleState:(NSDictionary *)state
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    NSDictionary *keyMap = @{
        @"currentId":    kCurrentId,
        @"currentPath":  kCurrentPath,
        @"pendingId":    kPendingId,
        @"pendingPath":  kPendingPath,
        @"lastGoodId":   kLastGoodId,
        @"lastGoodPath": kLastGoodPath,
    };
    for (NSString *jsKey in keyMap) {
        id value = state[jsKey];
        if (!value) continue;                       // key absent — leave as is
        NSString *prefKey = keyMap[jsKey];
        if ([value isEqual:[NSNull null]]) [defaults removeObjectForKey:prefKey];
        else                               [defaults setObject:value forKey:prefKey];
    }
    [defaults setInteger:0 forKey:kBootAttempts];
    [defaults synchronize];
    resolve(nil);
}

/** Path that would boot right now (pending → current), or null. */
RCT_EXPORT_METHOD(getBundlePath:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSString *path = [OTAModule selectBootPath:[NSUserDefaults standardUserDefaults]];
    resolve(path ?: [NSNull null]);
}

RCT_EXPORT_METHOD(getEmbeddedBundlePath:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSURL *url = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
    resolve(url ? url.path : [NSNull null]);
}

/** Reload the bridge so a staged bundle takes effect now. */
RCT_EXPORT_METHOD(reload:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_main_queue(), ^{
        RCTTriggerReloadCommandListeners(@"OTA update");
        resolve(nil);
    });
}

@end

// ─────────────────────────────────────────────────────────────
// INTEGRATION GUIDE — AppDelegate.mm
// ─────────────────────────────────────────────────────────────
//
// #import "OTAModule.h"
//
// - (NSURL *)sourceURLForBridge:(RCTBridge *)bridge {
//   NSURL *ota = [OTAModule bundleURLForBridge:bridge];
//   if (ota) return ota;
//   #if DEBUG
//     return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
//   #else
//     return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
//   #endif
// }
//
// ─────────────────────────────────────────────────────────────
