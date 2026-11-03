export const gitPushEnvironment = (environment) => {
  const pushEnvironment = { ...environment, GIT_TERMINAL_PROMPT: "0" };
  delete pushEnvironment.GH_TOKEN;
  delete pushEnvironment.GITHUB_TOKEN;
  delete pushEnvironment.GH_ENTERPRISE_TOKEN;
  return pushEnvironment;
};
