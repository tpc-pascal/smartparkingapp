const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  transformer: {
    // Minifier config for smaller JS bundle
    minifierConfig: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        unused: true,
        dead_code: true,
        hoist_funs: true,
        reduce_vars: true,
        side_effects: true,
      },
      output: {
        comments: false,
        ascii_only: true,
      },
      mangle: {
        toplevel: true,
        reserved: [],
      },
    },
  },
  serializer: {
    // Experimental tree-shaking: loại bỏ import không dùng
    experimentalImportSupport: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
