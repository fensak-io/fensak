import { RuleFnSourceLang } from "../udr/mod.ts";

/**
 * The configuration for an organization.
 */
interface OrgConfig {
  // The mapping of repo names (scoped to the org) to the corresponding repository configuration.
  repos: Record<string, RepoConfig>;
}

/**
 * The configuration for a specific repository.
 */
interface RepoConfig {
  // The path (relative to the repo root) to the file to use for the rules source.
  ruleFile: string;
  // The language that the rules source is written in. If omitted, the language is derived from the source file
  // extension. Note that we will always assume ES6 for js files.
  ruleLang?: RuleFnSourceLang;
}

export type { OrgConfig, RepoConfig };
