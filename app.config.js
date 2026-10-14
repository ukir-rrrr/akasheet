const appJson = require('./app.json');
const { resolveBuildMeta } = require('./scripts/resolveBuildMeta');

/** @type {import('expo/config').ConfigContext} */
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
