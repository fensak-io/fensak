// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { base64, config, Octokit, path, reng } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import { fensakCfgRepoName } from "../constants/mod.ts";
import {
  completeLoadFensakCfgCheck,
  getDefaultHeadSHA,
  initializeLoadFensakCfgCheck,
} from "../ghstd/mod.ts";
import type {
  ComputedFensakConfig,
  GitHubOrgWithSubscription,
  OrgConfig,
  RuleLookup,
} from "../svcdata/mod.ts";
import {
  acquireLock,
  FensakConfigSource,
  getComputedFensakConfig,
  releaseLock,
  storeComputedFensakConfig,
} from "../svcdata/mod.ts";

import { FensakConfigLoaderUserError } from "./errors.ts";
import { getRuleLang, parseConfigFile } from "./parser.ts";

const cfgFetchLockExpiry = 600 * 1000; // 10 minutes
const configFileSizeLimit = config.get("configFileSizeLimit");
const rulesFileSizeLimit = config.get("rulesFileSizeLimit");
const enforceSubscriptionPlan = config.get(
  "activeSubscriptionPlanRequired",
);
const planRepoLimits = config.get("planRepoLimits");

interface ITreeFile {
  path: string;
  sha: string;
  size: number;
  mode?: string;
  type?: string;
  url?: string;
}

interface IGitFileInfo {
  filename: string;
  gitSHA: string;
  size: number;
}

/**
 * Loads a Fensak configuration from GitHub with caching. This will first look in the KV cache, and if it is available
 * and current, return that. Otherwise, this looks up the configuration from the repository `.fensak` in the
 * organization.
 * Note that only one active thread will fetch the config directly from GitHub to avoid hitting API rate limits.
 *
 * @param clt An authenticated Octokit instance.
 * @param ghorg The GitHub org to load the config for, with the associated subscription marshalled.
 * @return The computed Fensak config for the GitHub org. Returns null if another thread is fetching the config.
 */
export async function loadConfigFromGitHub(
  clt: Octokit,
  ghorg: GitHubOrgWithSubscription,
): Promise<ComputedFensakConfig | null> {
  const headSHA = await getDefaultHeadSHA(clt, ghorg.name, fensakCfgRepoName);

  // Check the cache to see if we already have a computed version for this SHA, and if so, return it.
  const maybeCfg = await getComputedFensakConfig(
    FensakConfigSource.GitHub,
    ghorg.name,
  );
  if (maybeCfg && maybeCfg.gitSHA === headSHA) {
    return maybeCfg;
  }

  // Implement locking to ensure only one thread fetches from GitHub directly.
  const lockKey = `fetch-from-github-${ghorg.name}`;
  const lock = await acquireLock(lockKey, cfgFetchLockExpiry);
  if (!lock) {
    return null;
  }

  logger.info(`Fetching configuration from GitHub for ${ghorg.name}`);
  let checkID;
  try {
    checkID = await initializeLoadFensakCfgCheck(clt, ghorg.name, headSHA);
    const cfg = await fetchAndParseConfigFromDotFensak(
      clt,
      ghorg,
      headSHA,
    );
    await storeComputedFensakConfig(
      FensakConfigSource.GitHub,
      ghorg.name,
      cfg,
      ghorg.subscription?.id,
    );
    await completeLoadFensakCfgCheck(clt, ghorg.name, checkID, null);
    return cfg;
  } catch (e) {
    // Attempt to report the error to the user by reporting it on the GitHub check.
    try {
      if (!checkID) {
        // Ignore
      } else if (e instanceof FensakConfigLoaderUserError) {
        await completeLoadFensakCfgCheck(
          clt,
          ghorg.name,
          checkID,
          e.toString(),
        );
      } else {
        await completeLoadFensakCfgCheck(
          clt,
          ghorg.name,
          checkID,
          `Something went wrong while processing your Fensak configuration. We track errors automatically, but if it persists, please reach out to support@fensak.io`,
        );
      }
    } catch (repE) {
      logger.error(
        `error while reporting config load error for ${ghorg.name}: ${repE}`,
      );
    }

    throw e;
  } finally {
    await releaseLock(lock);
  }
}

export async function fetchAndParseConfigFromDotFensak(
  clt: Octokit,
  ghorg: GitHubOrgWithSubscription,
  headSHA: string,
): Promise<ComputedFensakConfig> {
  const fileLookup = await getFileLookup(clt, ghorg.name, headSHA);
  const cfgFinfo = getConfigFinfo(fileLookup);
  if (!cfgFinfo) {
    throw new FensakConfigLoaderUserError(
      `could not find fensak config file in repo \`${ghorg.name}/.fensak\``,
    );
  }
  if (cfgFinfo.size > configFileSizeLimit) {
    throw new FensakConfigLoaderUserError(
      `the config file \`${cfgFinfo.filename}\` in repo \`${ghorg.name}/.fensak\` is too large (limit 1MB)`,
    );
  }

  const orgCfgContents = await loadFileContents(clt, ghorg.name, cfgFinfo);
  let orgCfg;
  try {
    orgCfg = parseConfigFile(cfgFinfo.filename, orgCfgContents);
  } catch (e) {
    // Translate the error into a config loader error so that it can bubble to the user.
    throw new FensakConfigLoaderUserError(
      `error parsing config file \`${cfgFinfo.filename}\`: ${e}`,
    );
  }

  validateRepoLimits(
    ghorg,
    Object.keys(orgCfg.repos).length,
  );

  const ruleLookup = await loadRuleFiles(
    clt,
    ghorg.name,
    orgCfg,
    fileLookup,
    headSHA,
  );

  return {
    orgConfig: orgCfg,
    ruleLookup: ruleLookup,
    gitSHA: headSHA,
  };
}

/**
 * Create a lookup table that maps file paths in a repository tree to the file metadata.
 */
async function getFileLookup(
  clt: Octokit,
  owner: string,
  sha: string,
): Promise<Record<string, ITreeFile>> {
  const { data: tree } = await clt.git.getTree({
    owner: owner,
    repo: fensakCfgRepoName,
    tree_sha: sha,
    recursive: "true",
  });
  const out: Record<string, ITreeFile> = {};
  for (const f of tree.tree) {
    if (!f.path || !f.sha || !f.size) {
      continue;
    }
    out[f.path] = {
      path: f.path,
      sha: f.sha,
      size: f.size,
      mode: f.mode,
      type: f.type,
      url: f.url,
    };
  }
  return out;
}

/**
 * Get config file name and sha in the repo by walking the repository tree.
 */
function getConfigFinfo(
  repoTreeLookup: Record<string, ITreeFile>,
): IGitFileInfo | null {
  for (const fpath in repoTreeLookup) {
    const fpathBase = path.basename(fpath);
    const fpathExt = path.extname(fpathBase);
    if (fpathBase === `fensak${fpathExt}`) {
      const finfo = repoTreeLookup[fpath];
      return {
        filename: fpath,
        gitSHA: finfo.sha,
        size: finfo.size,
      };
    }
  }
  return null;
}

/**
 * Load the contents of the given file in the `.fensak` repository.
 */
async function loadFileContents(
  clt: Octokit,
  owner: string,
  finfo: IGitFileInfo,
): Promise<string> {
  const { data: file } = await clt.git.getBlob({
    owner: owner,
    repo: fensakCfgRepoName,
    file_sha: finfo.gitSHA,
  });

  if (file.encoding !== "base64") {
    throw new Error(
      `unknown encoding from github blob when retrieving ${finfo.filename}: ${file.encoding}`,
    );
  }
  const contentsBytes = base64.decode(file.content);
  return new TextDecoder().decode(contentsBytes);
}

/**
 * Load the referenced rule files in the org config from the `.fensak` repository so that they can be cached.
 */
async function loadRuleFiles(
  clt: Octokit,
  owner: string,
  orgCfg: OrgConfig,
  fileLookup: Record<string, ITreeFile>,
  repoSHA: string,
): Promise<RuleLookup> {
  const ruleFilesToLoad: Record<string, reng.RuleFnSourceLang> = {};
  for (const repoName in orgCfg.repos) {
    const repoCfg = orgCfg.repos[repoName];
    if (!ruleFilesToLoad[repoCfg.ruleFile]) {
      // This is redundant and unnecessary, but it makes the compiler happy.
      if (!repoCfg.ruleLang) {
        repoCfg.ruleLang = getRuleLang(repoCfg.ruleFile);
      }

      ruleFilesToLoad[repoCfg.ruleFile] = repoCfg.ruleLang;
    }
    if (
      repoCfg.requiredRuleFile && !ruleFilesToLoad[repoCfg.requiredRuleFile]
    ) {
      // This is redundant and unnecessary, but it makes the compiler happy.
      if (!repoCfg.requiredRuleLang) {
        repoCfg.requiredRuleLang = getRuleLang(repoCfg.requiredRuleFile);
      }

      ruleFilesToLoad[repoCfg.requiredRuleFile] = repoCfg.requiredRuleLang;
    }
  }

  const out: RuleLookup = {};
  for (const fname in ruleFilesToLoad) {
    const finfo = fileLookup[fname];
    if (!finfo) {
      throw new Error(
        `could not find referenced rule file '${fname}' in '.fensak' repository`,
      );
    }
    if (finfo.size > rulesFileSizeLimit) {
      throw new Error(
        `rules file ${fname} is too large (limit 512kb)`,
      );
    }

    const ruleLang = ruleFilesToLoad[fname];

    // NOTE
    // Ideally we can asynchronously fetch the contents here, but GitHub API is very strict about parallel calls and
    // rate limiting, so we have to resort to a lousy loop here.
    const contents = await loadFileContents(clt, owner, {
      filename: fname,
      gitSHA: finfo.sha,
      size: finfo.size,
    });
    const compiledContents = reng.compileRuleFn(contents, ruleLang);

    out[fname] = {
      sourceGitHash: finfo.sha,
      compiledRule: compiledContents,
      fileURL:
        `https://github.com/${owner}/${fensakCfgRepoName}/blob/${repoSHA}/${fname}`,
    };
  }
  return out;
}

function validateRepoLimits(
  ghorg: GitHubOrgWithSubscription,
  configRepoCount: number,
): void {
  const noActiveSubErr = new FensakConfigLoaderUserError(
    `\`${ghorg.name}\` does not have an active Fensak subscription plan`,
  );

  if (!enforceSubscriptionPlan) {
    // Allowing unlimited repos since we aren't enforcing subscription plans.
    return;
  }
  if (ghorg.subscription == null) {
    throw noActiveSubErr;
  }

  let maybeLimit = planRepoLimits[ghorg.subscription.planName];
  if (!maybeLimit) {
    maybeLimit = planRepoLimits[""];
  }

  const totalRepoCount = configRepoCount + ghorg.subscription.repoCount;
  if (totalRepoCount > maybeLimit) {
    throw new FensakConfigLoaderUserError(
      `the config file for \`${ghorg.name}\` exceeds or causes the org to exceed the repo limit for the org (limit is ${maybeLimit})`,
    );
  }
}
