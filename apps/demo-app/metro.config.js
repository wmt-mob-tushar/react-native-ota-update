const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '../..');

// The monorepo hoists react@18.3.x (dashboard) to the root while this app
// needs react@18.2.0 (react-native 0.74 peer). Force every `react` import
// to this app's copy so the bundle never contains two React instances.
const LOCAL_REACT = path.join(__dirname, 'node_modules', 'react');

const config = {
  watchFolders: [root],
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react' || moduleName.startsWith('react/')) {
        const mapped = moduleName.replace(/^react/, LOCAL_REACT);
        return context.resolveRequest(context, mapped, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    extraNodeModules: new Proxy(
      {},
      {
        get: (target, name) =>
          path.join(__dirname, 'node_modules', name),
      }
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
