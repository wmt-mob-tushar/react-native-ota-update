package com.ota;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * OTAPackage — register OTAModule with React Native.
 *
 * Add to MainApplication.getPackages():
 *
 *   @Override
 *   protected List<ReactPackage> getPackages() {
 *     List<ReactPackage> packages = new PackageList(this).getPackages();
 *     packages.add(new OTAPackage());
 *     return packages;
 *   }
 */
public class OTAPackage implements ReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new OTAModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
