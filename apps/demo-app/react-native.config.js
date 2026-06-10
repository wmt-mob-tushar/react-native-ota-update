module.exports = {
  dependencies: {
    // The OTA SDK is linked manually (settings.gradle :ota-sdk-android and
    // Podfile pod 'OTAModule') and registers OTAPackage in MainApplication.
    // Disable autolinking for it to avoid double registration.
    '@ota-platform/sdk': {
      platforms: { android: null, ios: null },
    },
  },
};
