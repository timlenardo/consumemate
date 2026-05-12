const { getDefaultConfig } = require('expo/metro-config');
const { withShareExtension } = require('expo-share-extension/metro');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Force Metro to use only the mobile directory's node_modules
config.projectRoot = projectRoot;
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Prevent Metro from looking at parent directories
config.resolver.disableHierarchicalLookup = true;

// Map expo-router to local node_modules
config.resolver.extraNodeModules = {
  'expo-router': path.resolve(projectRoot, 'node_modules/expo-router'),
};

// Wrap with share-extension support so Metro bundles the extension's
// JS entry (`index.share.js`) into a separate bundle alongside the main app.
module.exports = withShareExtension(config);
