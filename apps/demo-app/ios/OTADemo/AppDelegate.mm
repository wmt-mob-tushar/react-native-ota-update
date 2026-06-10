#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>

// OTA SDK native module
#import "OTAModule.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {

  self.moduleName     = @"OTADemo";
  self.initialProps   = @{};
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// ─── OTA: Return the active downloaded bundle, or fall back to Metro/embedded ─
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge {
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  // Try OTA bundle first; falls back to embedded bundle.zip in app resources
  return [OTAModule bundleURLForBridge:bridge]
      ?: [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

- (BOOL)concurrentRootEnabled {
  return YES;  // New Architecture
}

@end
