module.exports = async function(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.warn('Skipping notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD not set.');
    return;
  }

  const { notarize } = require('@electron/notarize');

  const appPath = `${appOutDir}/${packager.appInfo.productFilename}.app`;
  console.log(`Notarizing: ${appPath}`);
  try {
    await notarize({
      tool:            'notarytool',
      appPath,
      appleId:         process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId:          process.env.APPLE_TEAM_ID,
    });
    console.log('Notarization complete.');
  } catch (err) {
    console.error('Notarization failed:', err);
    throw err;
  }
};
