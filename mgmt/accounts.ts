// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Octokit } from "../deps.ts";

import {
  FensakConfigSource,
  getBitBucketWorkspace,
  getComputedFensakConfig,
  getGitHubOrgRecord,
} from "../svcdata/mod.ts";
import { isOrgManager } from "../ghstd/mod.ts";

export interface Account {
  source: "github" | "bitbucket";
  slug: string;
  app_is_installed: boolean;
  dotfensak_ready: boolean;
  subscription_id: string | null;
}

/**
 * Filters down the given GitHub Orgs (identified by slug) based on whether the authenticated user of the Octokit client
 * is an admin of the org.
 */
export async function filterAllowedGitHubOrgsForAuthenticatedUser(
  octokit: Octokit,
  slugs: string[],
): Promise<Account[]> {
  const orgData = await Promise.all(slugs.map((sl) => getGitHubOrgRecord(sl)));
  const allowedOrgs = await Promise.all(
    orgData.map(async (od): Promise<Account | null> => {
      if (od.value == null) {
        return null;
      }

      const isAllowed = await isOrgManager(octokit, od.value.name);
      if (!isAllowed) {
        return null;
      }

      const maybeCfg = await getComputedFensakConfig(
        FensakConfigSource.GitHub,
        od.value.name,
      );

      return {
        source: "github",
        slug: od.value.name,
        app_is_installed: od.value.installationID != null,
        dotfensak_ready: maybeCfg != null,
        subscription_id: od.value.subscriptionID,
      };
    }),
  );
  const out: Account[] = [];
  for (const o of allowedOrgs) {
    if (!o) {
      continue;
    }
    out.push(o);
  }
  return out;
}

/**
 * Filters down the given BitBucket Workspaces (identified by slug) based on whether the authenticated user
 * is an admin of the workspace.
 */
export async function filterAllowedBitBucketWorkspacesForAuthenticatedUser(
  token: string,
  slugs: string[],
): Promise<Account[]> {
  const wsLookup = await getWorkspacePermissionLookup(token);
  const wsData = await Promise.all(
    slugs.map((sl) => getBitBucketWorkspace(sl)),
  );
  const allowedWS = await Promise.all(
    wsData.map(async (ws): Promise<Account | null> => {
      if (ws.value == null) {
        return null;
      }

      const isAllowed = wsLookup[ws.value.name] === "owner";
      if (!isAllowed) {
        return null;
      }

      const maybeCfg = await getComputedFensakConfig(
        FensakConfigSource.BitBucket,
        ws.value.name,
      );

      return {
        source: "bitbucket",
        slug: ws.value.name,
        app_is_installed: ws.value.securityContext != null,
        dotfensak_ready: maybeCfg != null,
        subscription_id: ws.value.subscriptionID,
      };
    }),
  );
  const out: Account[] = [];
  for (const w of allowedWS) {
    if (!w) {
      continue;
    }
    out.push(w);
  }
  return out;
}

export async function getWorkspacePermissionLookup(
  token: string,
): Promise<Record<string, "owner" | "member">> {
  const wsUPath = "/user/permissions/workspaces";
  const wsResp = await fetch(
    `https://api.bitbucket.org/2.0${wsUPath}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  if (!wsResp.ok) {
    const rtext = await wsResp.text();
    throw new Error(
      `BitBucket API Error for url path ${wsUPath} (${wsResp.status}): ${rtext}`,
    );
  }
  const data = await wsResp.json();

  const wsPermissionLookup: Record<string, "owner" | "member"> = {};
  for (const wm of data.values) {
    wsPermissionLookup[wm.workspace.slug] = wm.permission as "owner" | "member";
  }
  return wsPermissionLookup;
}
