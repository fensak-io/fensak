import { Octokit } from "../deps.ts";

const checkName = "smart review";

export async function initializeCheck(
  clt: Octokit,
  owner: string,
  repo: string,
  headSHA: string,
): Promise<number> {
  const { data: check } = await clt.checks.create({
    owner: owner,
    repo: repo,
    name: checkName,
    head_sha: headSHA,
    status: "in_progress",
  });
  return check.id;
}

export async function completeCheck(
  clt: Octokit,
  owner: string,
  repo: string,
  checkID: number,
  conclusion: "success" | "action_required" | "failed",
): Promise<void> {
  await clt.checks.update({
    owner: owner,
    repo: repo,
    name: checkName,
    check_run_id: checkID,
    status: "completed",
    conclusion: conclusion,
  });
}
