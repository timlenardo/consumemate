const { getDefaultConfig } = require('expo/metro-config');
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

module.exports = config;
