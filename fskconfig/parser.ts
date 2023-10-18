// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Ajv, path, reng, toml, yaml } from "../deps.ts";

import type { OrgConfig } from "../svcdata/mod.ts";

const __dirname = path.dirname(path.fromFileUrl(import.meta.url));
const cfgSchemaTxt = await Deno.readTextFile(
  path.join(__dirname, "./schema.json"),
);
const cfgSchema = JSON.parse(cfgSchemaTxt);

const ajv = new Ajv();
const validateOrgSchema = ajv.compile(cfgSchema);

/**
 * Parses the contents of an organization config file into a valid Fensak Org config. This function uses the json schema
 * definition in schema.json to determine if the configuration is well formed.
 *
 * @param filename The name of the config file. Used to determine the file type for parsing.
 * @param contents The string contents of the config file.
 * @returns The parsed Fensak Organization configuration specified in the provided contents.
 */
export function parseConfigFile(
  filename: string,
  contents: string,
): OrgConfig {
  const ext = path.extname(filename);
  // deno-lint-ignore no-explicit-any
  let data: any;
  switch (ext) {
    default:
      throw new Error(`unsupported config file type: ${ext}`);

    case ".json":
      data = JSON.parse(contents);
      break;

    case ".toml":
      data = toml.parse(contents);
      break;

    case ".yml":
    case ".yaml":
      data = yaml.parse(contents);
      break;
  }
  if (!validateOrgSchema(data)) {
    const errMsg = ajv.errorsText(validateOrgSchema.errors);
    throw new Error(
      `config file ${filename} does not match expected schema: ${errMsg}`,
    );
  }
  const typedData: OrgConfig = data as OrgConfig;

  // Further validation on the data that requires more logic than json schema.
  for (const repoName in typedData.repos) {
    const cfg = typedData.repos[repoName];
    if (cfg.requiredRuleFile) {
      // Skip since it makes sense to allow 0 for required reviews if required rules are configured
      continue;
    }

    // Check to make sure the required reviews is greater than 0. If it is set to 0, then the check has no effect since
    // it will always pass.
    if (cfg.requiredApprovals == 0) {
      throw new Error(
        `requiredApprovals for repo ${repoName} must be greater than 0 when there are no required rules`,
      );
    }
    if (cfg.requiredApprovalsForTrustedUsers == 0) {
      throw new Error(
        `requiredApprovalsForTrustedUsers for repo ${repoName} must be greater than 0 when there are no required rules`,
      );
    }
    if (cfg.requiredApprovalsForMachineUsers == 0) {
      throw new Error(
        `requiredApprovalsForMachineUsers for repo ${repoName} must be greater than 0 when there are no required rules`,
      );
    }
  }

  // Configure defaults:
  // - set the machineUsers top level key to empty array if unset.
  // - set the ruleLang based on the filename extension if any entry is missing it.
  // - set the requiredRuleLang based on the filename extension if any entry is missing it and requiredRuleFile is
  //   configured.
  // - set the requiredApprovals to 1 if it is unset.
  // - set the requiredApprovalsForMachineUsers and requiredApprovalsForTrustedUsers to requiredApprovals if it is
  //   unset.
  if (!typedData.machineUsers) {
    typedData.machineUsers = [];
  }
  for (const repoName in typedData.repos) {
    const cfg = typedData.repos[repoName];
    if (cfg.ruleFile && !cfg.ruleLang) {
      typedData.repos[repoName].ruleLang = getRuleLang(cfg.ruleFile);
    }
    if (cfg.requiredRuleFile && !cfg.requiredRuleLang) {
      typedData.repos[repoName].requiredRuleLang = getRuleLang(
        cfg.requiredRuleFile,
      );
    }
    if (cfg.requiredApprovals === undefined) {
      typedData.repos[repoName].requiredApprovals = 1;
    }
    if (cfg.requiredApprovalsForMachineUsers === undefined) {
      typedData.repos[repoName].requiredApprovalsForMachineUsers =
        typedData.repos[repoName].requiredApprovals;
    }
    if (cfg.requiredApprovalsForTrustedUsers === undefined) {
      typedData.repos[repoName].requiredApprovalsForTrustedUsers =
        typedData.repos[repoName].requiredApprovals;
    }
  }

  return typedData;
}

export function getRuleLang(ruleFname: string): reng.RuleFnSourceLang {
  const ext = path.extname(ruleFname);
  switch (ext) {
    default:
      throw new Error(`unsupported rule file type: ${ext}`);

    case ".ts":
      return reng.RuleFnSourceLang.Typescript;
    case ".js":
      return reng.RuleFnSourceLang.ES6;
  }
}
