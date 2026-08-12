// npm runs this on every install of this package, on every platform.
//
// It cannot just be `node-gyp rebuild`. On Windows node-gyp's *configure* step
// searches for Visual Studio before it reads binding.gyp at all, so it fails
// with "Could not find any Visual Studio installation to use" long before the
// OS!='mac' condition in binding.gyp could tell it there is nothing to build.
// This file is the only place the skip can happen.
//
// The skip is silent-but-logged on purpose: darwin.js require()s this module in
// a try/catch, so an absent binary is a supported state off macOS. On macOS a
// build failure must stay loud, because it silently disables Chrome profile
// attribution via the Accessibility tree.

const { spawnSync } = require('child_process');

if (process.platform !== 'darwin') {
  console.log(`profile-probe: macOS-only native module, skipping build on ${process.platform}`);
  process.exit(0);
}

const result = spawnSync('node-gyp', ['rebuild'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status === null ? 1 : result.status);
