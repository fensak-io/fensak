// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, reng } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import { fensakCfgRepoName } from "../constants/mod.ts";
import { getDefaultHeadSHA, getListOfFiles } from "../bbstd/mod.ts";
import type {
  BitBucketWorkspaceWithSubscription,
  ComputedFensakConfig,
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
import { getConfigFinfo, validateRepoLimits } from "./loader_common.ts";
import type { ITreeFile } from "./loader_common.ts";

const cfgFetchLockExpiry = 600 * 1000; // 10 minutes
const configFileSizeLimit = config.get("configFileSizeLimit");
const rulesFileSizeLimit = config.get("rulesFileSizeLimit");

/**
 * Loads a Fensak configuration from BitBucket with caching. This will first look in the KV cache, and if it is available
 * and current, return that. Otherwise, this looks up the configuration from the repository `.fensak` in the
 * workspace.
 * Note that only one active thread will fetch the config directly from BitBucket to avoid hitting API rate limits.
 *
 * @param clt An authenticated BitBucket instance.
 * @param ws The BitBucket workspace to load the config for, with the associated subscription marshalled.
 * @return The computed Fensak config for the BitBucket Workspace. Returns null if another thread is fetching the config.
 */
export async function loadConfigFromBitBucket(
  clt: reng.BitBucket,
  ws: BitBucketWorkspaceWithSubscription,
): Promise<ComputedFensakConfig | null> {
  const headSHA = await getDefaultHeadSHA(clt, ws.name, fensakCfgRepoName);

  // Check the cache to see if we already have a computed version for this SHA, and if so, return it.
  const maybeCfg = await getComputedFensakConfig(
    FensakConfigSource.BitBucket,
    ws.name,
  );
  if (maybeCfg && maybeCfg.gitSHA === headSHA) {
    return maybeCfg;
  }

  // Implement locking to ensure only one thread fetches from BitBucket directly.
  const lockKey = `fetch-from-bitbucket-${ws.name}`;
  const lock = await acquireLock(lockKey, cfgFetchLockExpiry);
  if (!lock) {
    return null;
  }

  logger.info(`Fetching configuration from BitBucket for ${ws.name}`);

  // TODO
  // Implement status checks
  try {
    const cfg = await fetchAndParseConfigFromDotFensak(
      clt,
      ws,
      headSHA,
    );
    await storeComputedFensakConfig(
      FensakConfigSource.BitBucket,
      ws.name,
      cfg,
      ws.subscription?.id,
    );
    return cfg;
  } finally {
    await releaseLock(lock);
  }
}

export async function fetchAndParseConfigFromDotFensak(
  clt: reng.BitBucket,
  ws: BitBucketWorkspaceWithSubscription,
  headSHA: string,
): Promise<ComputedFensakConfig> {
  const fileLookup = await getFileLookup(clt, ws.name, headSHA);
  const cfgFinfo = getConfigFinfo(fileLookup);
  if (!cfgFinfo) {
    throw new FensakConfigLoaderUserError(
      `could not find fensak config file in repo \`${ws.name}/.fensak\``,
    );
  }
  if (cfgFinfo.size > configFileSizeLimit) {
    throw new FensakConfigLoaderUserError(
      `the config file \`${cfgFinfo.filename}\` in repo \`${ws.name}/.fensak\` is too large (limit 1MB)`,
    );
  }
  if (!cfgFinfo.url) {
    throw new Error(
      `could not get URL to the config file \`${cfgFinfo.filename}\` in BitBucket repo \`${ws.name}/.fensak\``,
    );
  }

  const resp = await clt.directAPICall(cfgFinfo.url);
  const orgCfgContents = await resp.text();

  let orgCfg;
  try {
    orgCfg = parseConfigFile(cfgFinfo.filename, orgCfgContents);
  } catch (e) {
    // Translate the error into a config loader error so that it can bubble to the user.
    throw new FensakConfigLoaderUserError(
      `error parsing config file \`${cfgFinfo.filename}\`: ${e}`,
    );
  }

  validateRepoLimits(ws, Object.keys(orgCfg.repos).length);

  const ruleLookup = await loadRuleFiles(
    clt,
    orgCfg,
    fileLookup,
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
  clt: reng.BitBucket,
  owner: string,
  sha: string,
): Promise<Record<string, ITreeFile>> {
  const files = await getListOfFiles(clt, owner, fensakCfgRepoName, sha);
  const out: Record<string, ITreeFile> = {};
  for (const f of files) {
    out[f.path] = {
      path: f.path,
      sha: f.commit.hash,
      size: f.size,
      url: f.links.self.href,
    };
  }
  return out;
}

/**
 * Load the referenced rule files in the org config from the `.fensak` repository so that they can be cached.
 */
async function loadRuleFiles(
  clt: reng.BitBucket,
  orgCfg: OrgConfig,
  fileLookup: Record<string, ITreeFile>,
): Promise<RuleLookup> {
  const ruleFilesToLoad: Record<string, reng.RuleFnSourceLang> = {};
  for (const repoName in orgCfg.repos) {
    const repoCfg = orgCfg.repos[repoName];
    if (repoCfg.ruleFile && !ruleFilesToLoad[repoCfg.ruleFile]) {
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
    if (!finfo.url) {
      throw new Error(
        `could not get URL for rules file ${fname}`,
      );
    }

    const ruleLang = ruleFilesToLoad[fname];

    // NOTE
    // Ideally we can asynchronously fetch the contents here, but BitBucket API is very strict about parallel calls and
    // rate limiting, so we have to resort to a lousy loop here.
    const resp = await clt.directAPICall(finfo.url);
    const contents = await resp.text();
    const compiledContents = reng.compileRuleFn(contents, ruleLang);

    out[fname] = {
      sourceGitHash: finfo.sha,
      compiledRule: compiledContents,
      fileURL: finfo.url,
    };
  }
  return out;
}
