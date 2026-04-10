const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Excluir paquetes del servidor (firebase-admin) del bundler de React Native
config.resolver = config.resolver || {};
config.resolver.blockList = [
  /node_modules\/.pnpm\/firebase-admin.*/,
  /artifacts\/api-server\/.*/,
];

module.exports = config;
