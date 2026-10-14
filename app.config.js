const appJson = require('./app.json');
const { resolveBuildMeta } = require('./scripts/resolveBuildMeta');

/**
 * Build ID is resolved when this config is evaluated (Metro / `expo export` start).
 * After you commit, restart Metro so the on-screen SHA updates — hot reload alone is not enough.
 *
 * @type {import('expo/config').ConfigContext}
 */
module.exports = () => {
  const { commitSha, dirty } = resolveBuildMeta();
  const appVersion =
    typeof appJson.expo.version === 'string' && appJson.expo.version ? appJson.expo.version : '0.0.0';
  return {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      buildCommitSha: commitSha,
      buildDirty: dirty,
      buildAppVersion: appVersion,
    },
  };
};
