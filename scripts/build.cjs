// A portable production build for browsers and both Capacitor platforms.
// Source maps are optional diagnostics; packaging them doubled the native app for no runtime benefit.
process.env.GENERATE_SOURCEMAP ??= 'false';
require('react-scripts/scripts/build');
