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
  return {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      buildCommitSha: commitSha,
      buildDirty: dirty,
    },
  };
};
