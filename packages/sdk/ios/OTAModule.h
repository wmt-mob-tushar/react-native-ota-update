//
//  OTAModule.h
//  OTA Platform — iOS native module
//
//  Provides the bridge between the JS SDK and the native bundle loader.
//  Implements sourceURLForBridge: so AppDelegate can load the OTA bundle.
//
//  Supports:
//    - Hermes engine
//    - Old Architecture (RCTBridgeModule)
//    - New Architecture (NativeOTAModuleSpec / Codegen — see OTAModuleSpec)
//

#import <React/RCTBridgeModule.h>
#import <React/RCTBridge.h>

NS_ASSUME_NONNULL_BEGIN

@interface OTAModule : NSObject <RCTBridgeModule>

/**
 * Returns the NSURL of the active OTA bundle.
 * Returns nil if no OTA bundle has been staged (use the embedded bundle).
 *
 * Called from AppDelegate.m in sourceURLForBridge:
 *
 *   #import "OTAModule.h"
 *
 *   - (NSURL *)sourceURLForBridge:(RCTBridge *)bridge {
 *     NSURL *otaBundle = [OTAModule bundleURLForBridge:bridge];
 *     if (otaBundle) return otaBundle;
 *   #if DEBUG
 *     return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
 *   #else
 *     return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
 *   #endif
 *   }
 */
+ (nullable NSURL *)bundleURLForBridge:(RCTBridge *)bridge;

/**
 * Returns the bundle URL from AsyncStorage without a bridge reference.
 * Safe to call before the bridge is fully initialised (e.g. in AppDelegate).
 */
+ (nullable NSURL *)bundleURL;

@end

NS_ASSUME_NONNULL_END
