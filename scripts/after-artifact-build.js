// electron-builder afterAllArtifactBuild hook.
// Runs the same secret-scan guard as scripts/upload-release.sh so the
// `npm run release` (electron-builder --publish) path can't ship a bundle the
// R2 upload path would have rejected. Throws to fail the build on any finding.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = function afterAllArtifactBuild(context) {
  const dist = (context && context.outDir) || 'dist';
  const audit = path.join(__dirname, 'audit-release.sh');
  try {
    execFileSync('bash', [audit, dist], { stdio: 'inherit' });
  } catch (e) {
    throw new Error('audit-release.sh failed — refusing to publish. See output above.');
  }
  return []; // no additional artifacts
};
