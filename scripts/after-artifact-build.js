// electron-builder afterAllArtifactBuild hook.
// Runs the same secret-scan guard as scripts/upload-release.sh so the
// `npm run release` (electron-builder --publish) path can't ship a bundle the
// R2 upload path would have rejected. Throws to fail the build on any finding.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Windows has no bash on PATH unless the user put Git's there, so a stock
// machine fails this hook with a bare ENOENT after a five-minute build. Git for
// Windows ships one and is already a prerequisite for working on this repo.
// Returns 'bash' unchanged everywhere else.
function bashCommand() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ];
  return candidates.find(p => p && fs.existsSync(p)) || 'bash';
}

module.exports = function afterAllArtifactBuild(context) {
  const dist = (context && context.outDir) || 'dist';
  const audit = path.join(__dirname, 'audit-release.sh');
  try {
    execFileSync(bashCommand(), [audit, dist], { stdio: 'inherit' });
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      throw new Error('audit-release.sh needs bash — install Git for Windows or put bash on PATH.');
    }
    throw new Error('audit-release.sh failed — refusing to publish. See output above.');
  }
  return []; // no additional artifacts
};
