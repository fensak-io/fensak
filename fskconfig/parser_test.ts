// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { assertEquals, assertThrows, path } from "../test_deps.ts";
import { parseConfigFile } from "./parser.ts";
import { RuleFnSourceLang } from "../udr/mod.ts";

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
        ruleLang: RuleFnSourceLang.Typescript,
        requiredApprovals: 2,
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
              ruleLang: RuleFnSourceLang.Typescript,
              requiredApprovals: 1,
              requiredApprovalsForMachineUsers: 1,
            },
            "test-fensak-config": {
              ruleFile: "config_change_rule.js",
              ruleLang: RuleFnSourceLang.ES5,
              requiredApprovals: 1,
              requiredApprovalsForMachineUsers: 1,
            },
            "test-fensak": {
              ruleFile: "app_version.js",
              ruleLang: RuleFnSourceLang.ES6,
              requiredApprovals: 1,
              requiredApprovalsForMachineUsers: 1,
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
