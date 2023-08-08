import { crypto, hex, Octokit, toHashString } from "../deps.ts";
import { IPatch, PatchOp } from "./patch.ts";
import { SourcePlatform } from "./from.ts";

/**
 * Represents a repository hosted on GitHub.
 * @property owner The owner of the repository.
 * @property name The name of the repository.
 */
export interface IGitHubRepository {
  owner: string;
  name: string;
}

/**
 * Represents the decoded patches for the Pull Request. This also includes a mapping from patch IDs to the URL to
 * retrieve the file contents.
 * @property patchList The list of file patches that are included in this PR.
 * @property patchFetchMap A mapping from a URL hash to the URL to fetch the contents for the file. The URL hash is
 *                         the sha256 hash of the URL with a random salt.
 */
export interface IGitHubPullRequestPatches {
  patchList: IPatch[];
  patchFetchMap: Record<string, URL>;
}

/**
 * Pull in the changes contained in the Pull Request and create an IPatch array and a mapping from PR file IDs to the
 * URL to fetch the contents.
 * @param clt An authenticated or anonymous GitHub API client created from Octokit.
 * @param repo The repository to pull the pull request changes from.
 * @param prNum The number of the PR where the changes should be pulled from.
 * @returns The list of patches that are contained in the Pull Request.
 */
export async function patchFromGitHubPullRequest(
  clt: Octokit,
  repo: IGitHubRepository,
  prNum: number,
): Promise<IGitHubPullRequestPatches> {
  const iter = clt.paginate.iterator(
    clt.pulls.listFiles,
    {
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNum,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
      per_page: 100,
    },
  );

  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  const fetchMapSalt = new TextDecoder().decode(hex.encode(a));

  const out: IGitHubPullRequestPatches = {
    patchList: [],
    patchFetchMap: {},
  };
  for await (const { data: prFiles } of iter) {
    for (const f of prFiles) {
      const fContentsURL = new URL(f.contents_url);
      const fContentsHash = await getGitHubPRFileID(fetchMapSalt, fContentsURL);
      out.patchFetchMap[fContentsHash] = fContentsURL;
      const fid = `${SourcePlatform.GitHub}:${fContentsHash}`;

      let op = PatchOp.Unknown;
      switch (f.status) {
        // This should never happen, so we throw an error
        default:
          throw new Error(
            `unknown status for file ${f.filename} in PR ${prNum} of repo ${repo.owner}/${repo.name}: ${f.status}`,
          );

        // A rename is a delete and then an insert, so special case it
        case "renamed":
          if (!f.previous_filename) {
            // This shouldn't happen because of the way the GitHub API works, so we throw an error.
            throw new Error("previous filename not available for a rename");
          }
          out.patchList[out.patchList.length] = {
            contentsID: fid,
            path: f.previous_filename,
            op: PatchOp.Delete,
            // TODO: figure out how to parse the unified patch into hunks.
            diff: [],
          };
          out.patchList[out.patchList.length] = {
            contentsID: fid,
            path: f.filename,
            op: PatchOp.Insert,
            // TODO: figure out how to parse the unified patch into hunks.
            diff: [],
          };
          continue;

        // The rest only needs to set the op

        case "added":
        case "copied": // a copy is the same as a file insert.
          op = PatchOp.Insert;
          break;
        case "removed":
          op = PatchOp.Delete;
          break;
        case "changed":
        case "modified":
          op = PatchOp.Modified;
          break;
      }
      out.patchList[out.patchList.length] = {
        contentsID: fid,
        path: f.filename,
        op: op,
        // TODO: figure out how to parse the unified patch into hunks.
        diff: [],
      };
    }
  }
  return out;
}

async function getGitHubPRFileID(salt: string, url: URL): Promise<string> {
  const toHash = `${salt}:${url}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(toHash),
  );
  return toHashString(digest);
}
