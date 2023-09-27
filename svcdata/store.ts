import { mainKV } from "./svc.ts";

enum TableNames {
  GitHubOrg = "github_org",
}

/**
 * Represents a GitHub organization that has installed Fensak.
 * @property name The name (in slug form) of the GitHub organization.
 * @property installationID The installation ID of the GitHub app. Used for authentication.
 */
export interface GitHubOrg {
  name: string;
  installationID: number;
}

/**
 * Stores the github organization into the KV store so that we can lookup the installation ID to authenticate as the
 * Org.
 */
export async function storeGitHubOrg(org: GitHubOrg): Promise<void> {
  await mainKV.set([TableNames.GitHubOrg, org.name], org);
}

/**
 * Retrieves the github organization from the KV store.
 */
export async function getGitHubOrg(orgName: string): Promise<GitHubOrg> {
  const entry = await mainKV.get([TableNames.GitHubOrg, orgName]);
  return entry.value as GitHubOrg;
}

/**
 * Loads the test GitHub Org into the KV store. This is primarily used for dev purposes.
 */
export async function loadTestGitHubOrg(instID: number) {
  await storeGitHubOrg({ name: "fensak-test", installationID: instID });
}
