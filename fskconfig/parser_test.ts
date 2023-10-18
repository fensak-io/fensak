// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { assertEquals, assertThrows, path } from "../test_deps.ts";
import { reng } from "../deps.ts";

import { parseConfigFile } from "./parser.ts";

const __dirname = path.dirname(path.fromFileUrl(import.meta.url));

Deno.test("parseConfigFile rejects invalid config", async () => {
  const fixtureInvalidNoRepoTxt = await Deno.readTextFile(
    path.join(__dirname, "fixtures", "invalid-no-repo.json"),
  );
  assertThrows(
    () => {
      parseConfigFile("invalid-no-repo.json", fixtureInvalidNoRepoTxt);
    },
    Error,
    "config file invalid-no-repo.json does not match expected schema",
  );
});

Deno.test("parseConfigFile rejects additional keys", async () => {
  const fixtureInvalidReqAppTxt = await Deno.readTextFile(
    path.join(__dirname, "fixtures", "invalid-additional-keys.json"),
  );
  assertThrows(
    () => {
      parseConfigFile(
        "invalid-additional-keys.json",
        fixtureInvalidReqAppTxt,
      );
    },
    Error,
    "config file invalid-additional-keys.json does not match expected schema",
  );
});

Deno.test("parseConfigFile rejects invalid requiredApprovals", async () => {
  const fixtureInvalidReqAppTxt = await Deno.readTextFile(
    path.join(__dirname, "fixtures", "invalid-required-approvals.json"),
  );
  assertThrows(
    () => {
      parseConfigFile(
        "invalid-required-approvals.json",
        fixtureInvalidReqAppTxt,
      );
    },
    Error,
    "config file invalid-required-approvals.json does not match expected schema",
  );
});

Deno.test("parseConfigFile rejects 0 requiredApprovals when no requiredRuleFile", async () => {
  const fname = "invalid-zero-required-approvals-when-no-requiredrule.json";
  const fixtureInvalidReqAppTxt = await Deno.readTextFile(
    path.join(
      __dirname,
      "fixtures",
      fname,
    ),
  );
  assertThrows(
    () => {
      parseConfigFile(fname, fixtureInvalidReqAppTxt);
    },
    Error,
    "requiredApprovals for repo test-fensak-rules-engine must be greater than 0",
  );
});

Deno.test("parseConfigFile rejects 0 requiredApprovalsForTrustedUsers when no requiredRuleFile", async () => {
  const fname =
    "invalid-zero-required-approvals-trusted-when-no-requiredrule.json";
  const fixtureInvalidReqAppTxt = await Deno.readTextFile(
    path.join(
      __dirname,
      "fixtures",
      fname,
    ),
  );
  assertThrows(
    () => {
      parseConfigFile(fname, fixtureInvalidReqAppTxt);
    },
    Error,
    "requiredApprovalsForTrustedUsers for repo test-fensak-rules-engine must be greater than 0",
  );
});

Deno.test("parseConfigFile rejects 0 requiredApprovalsForMachineUsers when no requiredRuleFile", async () => {
  const fname =
    "invalid-zero-required-approvals-machine-when-no-requiredrule.json";
  const fixtureInvalidReqAppTxt = await Deno.readTextFile(
    path.join(
      __dirname,
      "fixtures",
      fname,
    ),
  );
  assertThrows(
    () => {
      parseConfigFile(fname, fixtureInvalidReqAppTxt);
    },
    Error,
    "requiredApprovalsForMachineUsers for repo test-fensak-rules-engine must be greater than 0",
  );
});

Deno.test("parseConfigFile allows 0 requiredApprovals when requiredRuleFile is set", async () => {
  const fname = "valid-zero-required-approvals-with-requiredrule.json";
  const fixtureTxt = await Deno.readTextFile(
    path.join(
      __dirname,
      "fixtures",
      fname,
    ),
  );
  const cfg = parseConfigFile(fname, fixtureTxt);
  assertEquals(cfg, {
    repos: {
      "test-fensak-rules-engine": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: reng.RuleFnSourceLang.Typescript,
        requiredRuleFile: "source_branch.ts",
        requiredRuleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 0,
        requiredApprovalsForTrustedUsers: 0,
        requiredApprovalsForMachineUsers: 0,
      },
    },
    machineUsers: [],
  });
});

Deno.test("parseConfigFile allows 0 requiredApprovalsForTrustedUsers when requiredRuleFile is set", async () => {
  const fname = "valid-zero-required-approvals-trusted-with-requiredrule.json";
  const fixtureTxt = await Deno.readTextFile(
    path.join(
      __dirname,
      "fixtures",
      fname,
    ),
  );
  const cfg = parseConfigFile(fname, fixtureTxt);
  assertEquals(cfg, {
    repos: {
      "test-fensak-rules-engine": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: reng.RuleFnSourceLang.Typescript,
        requiredRuleFile: "source_branch.ts",
        requiredRuleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 1,
        requiredApprovalsForTrustedUsers: 0,
        requiredApprovalsForMachineUsers: 1,
      },
    },
    machineUsers: [],
  });
});

Deno.test("parseConfigFile allows 0 requiredApprovalsForMachineUsers when requiredRuleFile is set", async () => {
  const fname = "valid-zero-required-approvals-machine-with-requiredrule.json";
  const fixtureTxt = await Deno.readTextFile(
    path.join(
      __dirname,
      "fixtures",
      fname,
    ),
  );
  const cfg = parseConfigFile(fname, fixtureTxt);
  assertEquals(cfg, {
    repos: {
      "test-fensak-rules-engine": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: reng.RuleFnSourceLang.Typescript,
        requiredRuleFile: "source_branch.ts",
        requiredRuleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 1,
        requiredApprovalsForTrustedUsers: 1,
        requiredApprovalsForMachineUsers: 0,
      },
    },
    machineUsers: [],
  });
});

Deno.test("parseConfigFile single repo config", async () => {
  const fixtureFname = "valid-single-repo.json";
  const contents = await Deno.readTextFile(
    path.join(__dirname, "fixtures", fixtureFname),
  );
  const cfg = parseConfigFile(fixtureFname, contents);
  assertEquals(cfg, {
    repos: {
      "test-fensak-rules-engine": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 2,
        requiredApprovalsForTrustedUsers: 2,
        requiredApprovalsForMachineUsers: 2,
      },
    },
    machineUsers: [],
  });
});

Deno.test("parseConfigFile single repo config with only requiredRuleFile", async () => {
  const fixtureFname = "valid-only-required-rule.json";
  const contents = await Deno.readTextFile(
    path.join(__dirname, "fixtures", fixtureFname),
  );
  const cfg = parseConfigFile(fixtureFname, contents);
  assertEquals(cfg, {
    repos: {
      "test-fensak-rules-engine": {
        requiredRuleFile: "source_branch_rule.ts",
        requiredRuleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 0,
        requiredApprovalsForTrustedUsers: 0,
        requiredApprovalsForMachineUsers: 0,
      },
    },
    machineUsers: [],
  });
});

Deno.test("parseConfigFile accepts required rule file", async () => {
  const fixtureFname = "valid-with-required-rule.json";
  const contents = await Deno.readTextFile(
    path.join(__dirname, "fixtures", fixtureFname),
  );
  const cfg = parseConfigFile(fixtureFname, contents);
  assertEquals(cfg, {
    repos: {
      "test-fensak-rules-engine": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: reng.RuleFnSourceLang.Typescript,
        requiredRuleFile: "source_branch_rule.ts",
        requiredRuleLang: reng.RuleFnSourceLang.Typescript,
        requiredApprovals: 2,
        requiredApprovalsForTrustedUsers: 2,
        requiredApprovalsForMachineUsers: 2,
      },
    },
    machineUsers: [],
  });
});

Deno.test("parseConfigFile multi repo config (different formats)", async (t) => {
  const names = [
    "valid-multiple-repo.json",
    "valid-multiple-repo.toml",
    "valid-multiple-repo.yml",
    "valid-multiple-repo.yaml",
  ];
  await Promise.all(names.map((n) =>
    t.step({
      name: `case ${n}`,
      fn: async () => {
        const contents = await Deno.readTextFile(
          path.join(__dirname, "fixtures", n),
        );
        const cfg = parseConfigFile(n, contents);
        assertEquals(cfg, {
          repos: {
            "test-fensak-rules-engine": {
              ruleFile: "app_deploy_rule.ts",
              ruleLang: reng.RuleFnSourceLang.Typescript,
              requiredApprovals: 1,
              requiredApprovalsForTrustedUsers: 1,
              requiredApprovalsForMachineUsers: 1,
            },
            "test-fensak-config": {
              ruleFile: "config_change_rule.js",
              ruleLang: reng.RuleFnSourceLang.ES5,
              requiredApprovals: 1,
              requiredApprovalsForTrustedUsers: 1,
              requiredApprovalsForMachineUsers: 1,
            },
            "test-fensak": {
              ruleFile: "app_version.js",
              ruleLang: reng.RuleFnSourceLang.ES6,
              requiredApprovals: 1,
              requiredApprovalsForTrustedUsers: 1,
              requiredApprovalsForMachineUsers: 1,
            },
            "test-fensak-different-reviewers": {
              ruleFile: "app_version.js",
              ruleLang: reng.RuleFnSourceLang.ES6,
              requiredApprovals: 2,
              requiredApprovalsForTrustedUsers: 1,
              requiredApprovalsForMachineUsers: 3,
            },
          },
          machineUsers: [],
        });
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    })
  ));
});
