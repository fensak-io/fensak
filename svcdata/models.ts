// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { reng } from "../deps.ts";

/**
 * Represents a unique lock in the system, that can be used for unlocking.
 */
export interface Lock {
  key: string;
  id: string;
}

/**
 * Represents a GitHub organization that has installed Fensak.
 * @property name The name (in slug form) of the GitHub organization.
 * @property installationID The installation ID of the GitHub app. Used for authentication.
 * @property repoLimit The maximum number of repositories that can be configured with Fensak.
 * @property markerplacePlan The specific plan that was purchased for the org on the GitHub marketplace.
 */
export interface GitHubOrg {
  name: string;
  installationID: number | null;
  repoLimit: number;
  marketplacePlan: string | null;
}

/**
 * The configuration for an organization.
 * @property repos The mapping of repo names (scoped to the org) to the corresponding repository configuration.
 * @property machineUsers A list of user logins that map to machine users in your account. This should not include
 *                        GitHub Apps, as those are automatically labeled as machine users.
 */
export interface OrgConfig {
  repos: Record<string, RepoConfig>;
  machineUsers: string[];
}

/**
 * The configuration for a specific repository.
 * @property ruleFile The path (relative to the repo root) to the file to use for the rules source.
 * @property ruleLang The language that the rules source is written in. If omitted, the language is derived from the
 *                    source file extension. Note that we will always assume ES6 for js files.
 * @property requiredApprovals The number of unique approvals from users with write access that are required to pass the
 *                             check when the auto-approve rule fails. If omitted, defaults to 1.
 * @property requiredApprovalsForTrustedUsers The number of unique approvals from users with write access that are
 *                                            required to pass the check for pull requests opened by trusted users when
 *                                            the auto-approve rule fails. If omitted, defaults to the value set in
 *                                            requiredApprovals.
 * @property requiredApprovalsForMachineUsers The number of unique approvals from human users with write access that are
 *                                    required to pass the check for pull requests opened by machine users (GitHub Apps,
 *                                    or any user labeled as a machine user in the machineUsers top level key) when the
 *                                    auto-approve rule fails. If omitted, defaults to the value set in
 *                                    requiredApprovals.
 */
export interface RepoConfig {
  ruleFile: string;
  ruleLang?: reng.RuleFnSourceLang;
  requiredApprovals?: number;
  requiredApprovalsForTrustedUsers?: number;
  requiredApprovalsForMachineUsers?: number;
}

/**
 * The computed Fensak config for a particular organization.
 * @property orgConfig The user provided configuration defining which rules apply to which repo.
 * @property ruleLookup A lookup table that maps the rules in the org repo to their compiled definition.
 * @property gitSHA The commit sha used for retrieving the configuration. Used for cache busting.
 */
export interface ComputedFensakConfig {
  orgConfig: OrgConfig;
  ruleLookup: RuleLookup;
  gitSHA: string;
}

/**
 * The compiled ES5 compatible rule source.
 * @property sourceGitHash The git hash of the original source file. Used for cache busting.
 * @property compiledRule The compiled, ES5 compatible rule source file.
 */
export interface CompiledRuleSource {
  sourceGitHash: string;
  compiledRule: string;
  fileURL: string;
}

/**
 * A lookup table mapping source file names to the corresponding compiled file contents. This is used to quickly
 * retrieve the source contents for a particular Org.
 */
export type RuleLookup = Record<string, CompiledRuleSource>;
