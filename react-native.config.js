// react-native.config.js
//
// This app doesn't use Solana wallet sign-in — @clerk/expo bundles it as
// one of many OPTIONAL auth strategies, which pulls in
// @solana-mobile/mobile-wallet-adapter-protocol as a real transitive
// dependency purely because it's reachable in node_modules
// (@clerk/expo -> @clerk/clerk-js -> @solana/wallet-adapter-react ->
// @solana-mobile/wallet-adapter-mobile -> this package). React Native's
// autolinking has no way to know it's unused; it just sees a package with
// a `codegenConfig` in its package.json and tries to build it.
//
// That package's own Android codegen setup fails to configure under this
// project's RN/CMake version ("add_subdirectory given source ... which is
// not an existing directory" for its generated codegen/jni folder — its
// build never produces that output here, whether from a genuine bug in
// the package or a version mismatch wasn't investigated further since we
// have zero use for it regardless).
//
// Excluding it from autolinking entirely (Android and iOS) is the
// standard, documented way to tell RN "don't try to link this" — this
// takes effect on the next `expo prebuild`, no other changes needed.
module.exports = {
  dependencies: {
    "@solana-mobile/mobile-wallet-adapter-protocol": {
      platforms: { android: null, ios: null },
    },
  },
};
