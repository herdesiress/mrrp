import assert from "node:assert/strict";
import test from "node:test";
import { gitPushEnvironment } from "./git-push-environment.mjs";

test("Git pushes use gh's selected account instead of inherited token overrides", () => {
  const environment = gitPushEnvironment({
    GH_TOKEN: "stale-gh-token",
    GITHUB_TOKEN: "stale-actions-token",
    GH_ENTERPRISE_TOKEN: "stale-enterprise-token",
    GH_CONFIG_DIR: "/safe/config",
    PATH: "/usr/bin"
  });
  assert.equal(environment.GH_TOKEN, undefined);
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.GH_ENTERPRISE_TOKEN, undefined);
  assert.equal(environment.GH_CONFIG_DIR, "/safe/config");
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.GIT_TERMINAL_PROMPT, "0");
});
