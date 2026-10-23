const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
config.resolver.assetExts.push('siddur');
config.resolver.blockList = [...config.resolver.blockList, /[\\/]\.claude[\\/]/];

module.exports = config;
