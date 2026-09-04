/*
 * Vision Camera's frame processors run JavaScript on the native camera thread.
 * That is not ordinary JS: each such function is compiled into a "worklet" by
 * these two plugins, and without them the CNIC detector silently never runs.
 *
 * Order matters — worklets-core must come before reanimated.
 *
 * Until now this project had no babel config at all and inherited
 * `babel-preset-expo` by default. That preset is still the whole configuration
 * here; the file exists only to add the two plugins.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [["react-native-worklets-core/plugin"], "react-native-reanimated/plugin"],
  };
};
