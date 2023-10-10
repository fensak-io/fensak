// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from "../test_deps.ts";
import { reng } from "../deps.ts";

import { getRandomString } from "../xtd/mod.ts";
import { octokitRestTestClt } from "../ghauth/rest_test.ts";
import type {
  GitHubOrgWithSubscription,
  Subscription,
} from "../svcdata/mod.ts";
import {
  FensakConfigSource,
  getComputedFensakConfig,
  getSubscription,
  storeSubscription,
} from "../svcdata/mod.ts";

import {
  fetchAndParseConfigFromDotFensak,
  loadConfigFromGitHub,
} from "./loader_github.ts";

const expectedHeadSHA = "196e30534c1263648b0f5d7c35360a23e963d662";

Deno.test("loadConfigFromGitHub for fensak-test example repo", async () => {
  // We must first load a real subscription object to Deno KV since storing the Fensak config will depend on it.
  const randomSubID = `sub_${getRandomString(6)}`;
  const sub: Subscription = {
    id: randomSubID,
    mainOrgName: "fensak-test",
    planName: "pro",
    repoCount: 0,
  };
  const ok = await storeSubscription(sub);
  assert(ok);

  const testOrg: GitHubOrgWithSubscription = {
    name: "fensak-test",
    installationID: 0,
    subscription: sub,
  };

  const cfg = await loadConfigFromGitHub(
    octokitRestTestClt,
    testOrg,
  );
  assertExists(cfg);
  assertEquals(cfg.gitSHA, expectedHeadSHA);
  assertEquals(cfg.orgConfig, {
    repos: {
      "test-fensak-rules-engine": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 1,
        requiredApprovalsForTrustedUsers: 1,
        requiredApprovalsForMachineUsers: 1,
      },
      "test-fensak-automated-readme-only": {
        ruleFile: "subfolder/allow_readme_changes.js",
        ruleLang: reng.RuleFnSourceLang.ES6,
        requiredApprovals: 1,
        requiredApprovalsForTrustedUsers: 1,
        requiredApprovalsForMachineUsers: 1,
      },
      "test-fensak-automated-appdeploy": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 1,
        requiredApprovalsForTrustedUsers: 1,
        requiredApprovalsForMachineUsers: 2,
      },
    },
    machineUsers: [],
  });

  // Test that the ruleLookup record contains rules for the expected rule functions.
  //
  // Ideally we can use the assertion functions to test this, but for some bizarre reason, even though the object
  // materializes, the assertion functions see that the object is undefined.
  const appDeployRule = cfg.ruleLookup["app_deploy_rule.ts"];
  if (!appDeployRule) {
    assert(false, "The rule app_deploy_rule.ts was not successfully compiled");
  }
  const allowReadmeChanges =
    cfg.ruleLookup["subfolder/allow_readme_changes.js"];
  if (!allowReadmeChanges) {
    assert(
      false,
      "The rule subfolder/allow_readme_changes.js was not successfully compiled",
    );
  }

  // Test that the compiled config was successfully saved in the DB.
  //
  // TODO
  // add some basic testing for the compiled rule source
  const refreshedCfg = await getComputedFensakConfig(
    FensakConfigSource.GitHub,
    "fensak-test",
  );
  assertExists(refreshedCfg);

  // Test that the repo count was incremented on the subscription object.
  const refreshedSub = await getSubscription(sub.id);
  assertEquals(refreshedSub.value?.repoCount, 3);
});

Deno.test("fetchAndParseConfigFromDotFensak checks repo limits", async () => {
  const testOrg: GitHubOrgWithSubscription = {
    name: "fensak-test",
    installationID: 0,
    subscription: {
      id: "sub_asdf",
      mainOrgName: "fensak-test",
      planName: "pro",
      repoCount: 5,
    },
  };

  await assertRejects(
    () =>
      fetchAndParseConfigFromDotFensak(
        octokitRestTestClt,
        testOrg,
        expectedHeadSHA,
      ),
    Error,
    "exceeds the repo limit for the org",
  );
});
