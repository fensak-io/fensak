import { base64, config, Octokit, path } from "../deps.ts";

import { compileRuleFn, RuleFnSourceLang } from "../udr/mod.ts";

import type { ComputedFensakConfig, OrgConfig, RuleLookup } from "./types.ts";
import { getRuleLang, parseConfigFile } from "./parser.ts";

const fensakCfgRepoName = ".fensak";
const configFileSizeLimit = config.get("configFileSizeLimit");
const rulesFileSizeLimit = config.get("rulesFileSizeLimit");

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
 * Loads a Fensak configuration from GitHub. This looks up the configuration from the repository `.fensak` in the
 * organization.
 *
 * @param clt An authenticated Octokit instance.
 * @param owner The GitHub owner to load the config for.
 */
export async function loadConfigFromGitHub(
  clt: Octokit,
  owner: string,
): Promise<ComputedFensakConfig> {
  const { data: repo } = await clt.repos.get({
    owner: owner,
    repo: fensakCfgRepoName,
  });
  const defaultBranch = repo.default_branch;
  const { data: ref } = await clt.git.getRef({
    owner: owner,
    repo: fensakCfgRepoName,
    ref: `heads/${defaultBranch}`,
  });
  const headSHA = ref.object.sha;

  // TODO
  // Load from cache if the SHA is the same.

  const fileLookup = await getFileLookup(clt, owner, headSHA);
  const cfgFinfo = getConfigFinfo(fileLookup);
  if (!cfgFinfo) {
    throw new Error(
      `could not find fensak config file in the '${owner}/.fensak' repo`,
    );
  }
  if (cfgFinfo.size > configFileSizeLimit) {
    throw new Error(
      `the config file ${cfgFinfo.filename} is too large (limit 1MB)`,
    );
  }

  const orgCfgContents = await loadFileContents(clt, owner, cfgFinfo);
  const orgCfg = parseConfigFile(cfgFinfo.filename, orgCfgContents);
  const ruleLookup = await loadRuleFiles(
    clt,
    owner,
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
  const ruleFilesToLoad: Record<string, RuleFnSourceLang> = {};
  for (const repoName in orgCfg.repos) {
    const repoCfg = orgCfg.repos[repoName];
    if (ruleFilesToLoad[repoCfg.ruleFile]) {
      // Skip because it is already accounted for
      continue;
    }

    // This is redundant and unnecessary, but it makes the compiler happy.
    if (!repoCfg.ruleLang) {
      repoCfg.ruleLang = getRuleLang(repoCfg.ruleFile);
    }

    ruleFilesToLoad[repoCfg.ruleFile] = repoCfg.ruleLang;
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
    const compiledContents = compileRuleFn(contents, ruleLang);

    out[fname] = {
      sourceGitHash: finfo.sha,
      compiledRule: compiledContents,
      fileURL: new URL(
        `https://github.com/${owner}/${fensakCfgRepoName}/blob/${repoSHA}/${fname}`,
      ),
    };
  }
  return out;
}
