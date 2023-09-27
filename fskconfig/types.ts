import { RuleFnSourceLang } from "../udr/mod.ts";

/**
 * The configuration for an organization.
 * @property repos The mapping of repo names (scoped to the org) to the corresponding repository configuration.
 */
interface OrgConfig {
  repos: Record<string, RepoConfig>;
}

/**
 * The configuration for a specific repository.
 * @property ruleFile The path (relative to the repo root) to the file to use for the rules source.
 * @property ruleLang The language that the rules source is written in. If omitted, the language is derived from the
 *                    source file extension. Note that we will always assume ES6 for js files.
 * @property requiredApprovals The number of unique approvals from users with write access that are required to pass the
 *                             check when the auto-approve rule fails. If omitted, defaults to 1.
 */
interface RepoConfig {
  ruleFile: string;
  ruleLang?: RuleFnSourceLang;
  requiredApprovals?: number;
}

/**
 * The computed Fensak config for a particular organization.
 * @property orgConfig The user provided configuration defining which rules apply to which repo.
 * @property ruleLookup A lookup table that maps the rules in the org repo to their compiled definition.
 * @property gitSHA The commit sha used for retrieving the configuration. Used for cache busting.
 */
interface ComputedFensakConfig {
  orgConfig: OrgConfig;
  ruleLookup: RuleLookup;
  gitSHA: string;
}

/**
 * The compiled ES5 compatible rule source.
 * @property sourceGitHash The git hash of the original source file. Used for cache busting.
 * @property compiledRule The compiled, ES5 compatible rule source file.
 */
interface CompiledRuleSource {
  sourceGitHash: string;
  compiledRule: string;
  fileURL: URL;
}

/**
 * A lookup table mapping source file names to the corresponding compiled file contents. This is used to quickly
 * retrieve the source contents for a particular Org.
 */
type RuleLookup = Record<string, CompiledRuleSource>;

export type {
  CompiledRuleSource,
  ComputedFensakConfig,
  OrgConfig,
  RepoConfig,
  RuleLookup,
};
