import { Octokit } from "../deps.ts";
import { IPatch, PatchOp } from "./patch.ts";

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
 * Create an IPatch array containing the changes from a Pull Request.
 * @param clt An authenticated or anonymous GitHub API client created from Octokit.
 * @param repo The repository to pull the pull request changes from.
 * @param prNum The number of the PR where the changes should be pulled from.
 * @returns The list of patches that are contained in the Pull Request.
 */
export async function patchFromGitHubPullRequest(
  clt: Octokit,
  repo: IGitHubRepository,
  prNum: number,
): Promise<IPatch[]> {
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

  const out: IPatch[] = [];
  for await (const { data: prFiles } of iter) {
    for (const f of prFiles) {
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
          out[out.length] = {
            path: f.previous_filename,
            op: PatchOp.Delete,
            // TODO: figure out how to retrieve this. Probably through the contents_url?
            originalFull: "",
            updatedFull: "",
            // TODO: figure out how to parse the unified patch into hunks.
            diff: [],
          };
          out[out.length] = {
            path: f.filename,
            op: PatchOp.Insert,
            // TODO: figure out how to retrieve this. Probably through the contents_url?
            originalFull: "",
            updatedFull: "",
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
      out[out.length] = {
        path: f.filename,
        op: op,
        // TODO: figure out how to retrieve this. Probably through the contents_url?
        originalFull: "",
        updatedFull: "",
        // TODO: figure out how to parse the unified patch into hunks.
        diff: [],
      };
    }
  }
  return out;
}
