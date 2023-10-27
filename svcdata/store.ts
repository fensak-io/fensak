// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { crypto, sleep } from "../deps.ts";

import { logger } from "../logging/mod.ts";

import { mainKV } from "./svc.ts";
import {
  BitBucketWorkspace,
  ComputedFensakConfig,
  GitHubOrg,
  GitHubOrgWithSubscription,
  Lock,
  Subscription,
} from "./models.ts";

enum TableNames {
  HealthCheck = "healthcheck",
  Subscription = "subscription",
  GitHubOrg = "github_org",
  BitBucketWorkspace = "bitbucket_workspace",
  BitBucketWorkspaceNameByClientKey = "bitbucket_workspace_name_by_client_key",
  FensakConfig = "fensak_config",
  Lock = "lock",
}

export enum FensakConfigSource {
  GitHub = "github",
  BitBucket = "bitbucket",
}

/**
 * Stores the healthcheck result into the KV store.
 */
export async function storeHealthCheckResult(reqID: string): Promise<void> {
  await mainKV.set([TableNames.HealthCheck, reqID], true, { expireIn: 60000 });
}

/**
 * Waits for the healthcheck result to be populated, with a timeout.
 */
export async function waitForHealthCheckResult(
  reqID: string,
): Promise<boolean> {
  const maxTries = 30;
  const sleepBetweenTries = 2;

  for (let i = 0; i < maxTries; i++) {
    const result = await mainKV.get([TableNames.HealthCheck, reqID]);
    if (result.value) {
      return true;
    }

    if (i < maxTries - 1) {
      logger.debug(
        `Health check result not ready (try ${
          i + 1
        } of ${maxTries}). Retrying after sleep for ${sleepBetweenTries} seconds.`,
      );
      await sleep.sleep(sleepBetweenTries * 1000);
    }
  }

  logger.error("Timed out waiting for healthcheck result");
  return false;
}

/**
 * Acquire a lock from the lock table to coordinate concurrent operations. This works by making an atomic transaction
 * against the KV table to put an entry for the unique key provided by the user.
 * @param key The unique key string to acquire the lock on. All operations coordinating should use the same lock key.
 * @param expireIn The number of milliseconds after which the lock will automatically expire.
 * @return A lock object that can be used for unlocking. Returns null if the current thread could not acquire the lock.
 */
export async function acquireLock(
  key: string,
  expireIn: number,
): Promise<Lock | null> {
  const tableKey = [TableNames.Lock, key];
  const result = await mainKV.get<string>(tableKey);
  if (result.value) {
    // Someone already holds the lock.
    return null;
  }

  const id = crypto.randomUUID();
  const { ok: acquired } = await mainKV.atomic()
    .check(result)
    .set(tableKey, id, { expireIn })
    .commit();
  if (acquired) {
    return { key, id };
  }
  return null;
}

/**
 * Releases the acquired lock from the lock table so that it is available.
 * @param lock The acquired lock to be released.
 */
export async function releaseLock(lock: Lock): Promise<void> {
  const tableKey = [TableNames.Lock, lock.key];
  const result = await mainKV.get<string>(tableKey);
  if (!result.value) {
    logger.warn(
      `Attempted to release lock ${lock.key} (id: ${lock.id}) that is already released.`,
    );
    return;
  }
  if (result.value !== lock.id) {
    throw new Error(
      `Could not release lock ${lock.key}: id mismatch (expected ${lock.id}, got ${result.value})`,
    );
  }

  const { ok } = await mainKV.atomic()
    .check(result)
    .delete(tableKey)
    .commit();
  if (!ok) {
    throw new Error(
      `Could not release lock ${lock.key} (id: ${lock.id}): lock ID changed`,
    );
  }
}

/**
 * Stores the subscription into the KV store. This will also create or update the record for the GitHub Organization.
 * @returns Whether the record was successfully stored.
 */
export async function storeSubscription(
  subscription: Subscription,
  existingSubRecord?: Deno.KvEntryMaybe<Subscription>,
): Promise<boolean> {
  const key = [TableNames.Subscription, subscription.id];

  let staged;
  if (existingSubRecord) {
    staged = mainKV.atomic()
      .check(existingSubRecord)
      .set(key, subscription);
  } else {
    staged = mainKV.atomic().set(key, subscription);
  }

  // TODO
  // Handle bitbucket

  const orgKey = [TableNames.GitHubOrg, subscription.mainOrgName];
  const existingOrg = await getGitHubOrgRecord(subscription.mainOrgName);
  staged = staged.check(existingOrg);
  if (existingOrg.value) {
    const org = { ...existingOrg.value };
    org.subscriptionID = subscription.id;
    staged = staged.set(orgKey, org);
  } else {
    staged = staged.set(orgKey, {
      name: subscription.mainOrgName,
      installationID: null,
      subscriptionID: subscription.id,
    });
  }

  const { ok } = await staged.commit();
  return ok;
}

/**
 * Gets the subscription by the given ID.
 * @returns The subscription object for the ID.
 */
export async function getSubscription(
  id: string,
): Promise<Deno.KvEntryMaybe<Subscription>> {
  const key = [TableNames.Subscription, id];
  // deno-lint-ignore no-explicit-any
  const obj = await mainKV.get<any>(key);

  // TODO: figure out a better way to do this.
  // Check and migrate to new repoCount field.
  if (obj.value && Number.isInteger(obj.value.repoCount)) {
    const updated = { ...obj.value };
    updated.repoCount = {};
    const { ok } = await mainKV.atomic()
      .check(obj)
      .set(key, updated)
      .commit();
    if (!ok) {
      throw new Error(
        `Transaction error while migrating subscription ${id} to new data format.`,
      );
    }
  }

  // At this point, we can be certain the object is in the right format.
  return await mainKV.get<Subscription>(key);
}

/**
 * Deletes the given subscription from the KV store.
 *
 * TODO
 * Disassociate subscription from all the associated GitHub orgs.
 */
export async function deleteSubscription(id: string): Promise<void> {
  await mainKV.delete([TableNames.Subscription, id]);
}

/**
 * Stores the github organization into the KV store so that we can lookup the installation ID to authenticate as the
 * Org. If existingOrgRecord is provided, this will do an atomic check to make sure the state hasn't changed.
 * @returns Whether the record was successfully stored.
 */
export async function storeGitHubOrg(
  org: GitHubOrg,
  existingOrgRecord?: Deno.KvEntryMaybe<GitHubOrg>,
): Promise<boolean> {
  const key = [TableNames.GitHubOrg, org.name];

  if (!existingOrgRecord) {
    await mainKV.set(key, org);
    return true;
  }

  const { ok } = await mainKV.atomic()
    .check(existingOrgRecord)
    .set(key, org)
    .commit();
  return ok;
}

/**
 * Deletes the record of the github organization in the KV store. This also deletes any cached config data from our
 * internal records.
 */
export async function deleteGitHubOrg(
  orgName: string,
  existingOrgRecord?: Deno.KvEntryMaybe<GitHubOrg>,
): Promise<void> {
  if (!existingOrgRecord) {
    existingOrgRecord = await getGitHubOrgRecord(orgName);
  }
  if (!existingOrgRecord.value) {
    // Do nothing since the org is already deleted.
    return;
  }

  let staged = mainKV.atomic()
    .check(existingOrgRecord);

  // If there is a subscription associated, then we also need to null out the counter.
  const maybeSubID = existingOrgRecord.value?.subscriptionID;
  if (maybeSubID) {
    const existingSubscription = await getSubscription(maybeSubID);
    if (existingSubscription.value) {
      const updatedSub = { ...existingSubscription.value };
      delete updatedSub.repoCount[orgName];
      staged = staged.check(existingSubscription)
        .set([TableNames.Subscription, maybeSubID], updatedSub);
    }
  }

  const { ok } = await staged
    .delete([TableNames.GitHubOrg, orgName])
    .delete([TableNames.FensakConfig, FensakConfigSource.GitHub, orgName])
    .commit();
  if (!ok) {
    throw new Error(
      `Could not delete org ${orgName} and associated config from system.`,
    );
  }
}

/**
 * Removes the installationID record on the GitHub Org and also deletes all associated config data.
 */
export async function removeInstallationForGitHubOrg(
  existingOrgRecord: Deno.KvEntryMaybe<GitHubOrg>,
): Promise<void> {
  if (!existingOrgRecord.value) {
    throw new Error(
      "removeInstallationForGitHubOrg only works on records with an org value",
    );
  }

  const org = { ...existingOrgRecord.value };
  org.installationID = null;

  const { ok } = await mainKV.atomic()
    .check(existingOrgRecord)
    .set([TableNames.GitHubOrg, org.name], org)
    .delete([TableNames.FensakConfig, FensakConfigSource.GitHub, org.name])
    .commit();
  if (!ok) {
    throw new Error(
      `Could not remove installation for GitHub org ${org.name}`,
    );
  }
}

/**
 * Retrieves the raw github organization record from the KV store. This is useful for use with the existingOrgRecord
 * parameter in storeGitHubOrg.
 */
export async function getGitHubOrgRecord(
  orgName: string,
): Promise<Deno.KvEntryMaybe<GitHubOrg>> {
  return await mainKV.get<GitHubOrg>([TableNames.GitHubOrg, orgName]);
}

/**
 * Retrieves the github organization from the KV store. This will throw an error if there is no record of the
 * corresponding organization.
 */
export async function mustGetGitHubOrg(orgName: string): Promise<GitHubOrg> {
  const entry = await mainKV.get<GitHubOrg>([TableNames.GitHubOrg, orgName]);
  if (!entry.value) {
    throw new Error(`no installation found for GitHub Org ${orgName}`);
  }
  return entry.value;
}

/**
 * Retrieves the github organization with the subscription data from the KV store. This will throw an error if there is
 * no record of the corresponding organization.
 *
 * Note that this will also update the github org if it has a subscriptionID associated with it and the subscription
 * doesn't exist.
 */
export async function mustGetGitHubOrgWithSubscription(
  orgName: string,
): Promise<GitHubOrgWithSubscription> {
  const entry = await mainKV.get<GitHubOrg>([TableNames.GitHubOrg, orgName]);
  if (!entry.value) {
    throw new Error(`no installation found for GitHub Org ${orgName}`);
  }

  const out: GitHubOrgWithSubscription = {
    name: entry.value.name,
    installationID: entry.value.installationID,
    subscription: null,
  };
  if (entry.value.subscriptionID) {
    const sub = await getSubscription(entry.value.subscriptionID);
    if (!sub.value) {
      // Subscription doesn't exist, so update GitHub Org to remove that link.
      const ghorg = { ...entry.value };
      ghorg.subscriptionID = null;
      const ok = await storeGitHubOrg(ghorg, entry);
      if (!ok) {
        throw new Error(
          `could not update outdated subscription info for GitHub Org ${orgName}`,
        );
      }
    } else {
      out.subscription = sub.value;
    }
  }

  return out;
}

/**
 * Retrieves the raw BitBucket workspace record from the KV store by name. This is useful for use with the
 * existingWorkspaceRecord parameter in storeBitBucketWorkspace.
 */
export async function getBitBucketWorkspace(
  wsName: string,
): Promise<Deno.KvEntryMaybe<BitBucketWorkspace>> {
  return await mainKV.get<BitBucketWorkspace>([
    TableNames.BitBucketWorkspace,
    wsName,
  ]);
}

/**
 * Retrieves the name of a BitBucket workspace that is associated with the given client key.
 */
export async function getBitBucketWorkspaceNameByClientKey(
  wsClientKey: string,
): Promise<Deno.KvEntryMaybe<string>> {
  return await mainKV.get<string>([
    TableNames.BitBucketWorkspaceNameByClientKey,
    wsClientKey,
  ]);
}

/**
 * Retrieves the BitBucket workspace that is associated with the given client key. This will return both the secondary
 * index name lookup record and the workspace record.
 */
export async function getBitBucketWorkspaceByClientKey(
  wsClientKey: string,
): Promise<
  [Deno.KvEntryMaybe<string>, Deno.KvEntryMaybe<BitBucketWorkspace> | null]
> {
  const bbName = await getBitBucketWorkspaceNameByClientKey(wsClientKey);
  if (!bbName.value) {
    return [bbName, null];
  }

  const bbWS = await getBitBucketWorkspace(bbName.value);
  return [bbName, bbWS];
}

/**
 * Stores the BitBucket workspace record into the KV store.
 * If existingWorkspaceRecord is provided, this will do an atomic check to make sure the state hasn't changed.
 * @returns Whether the record was successfully stored.
 */
export async function storeBitBucketWorkspace(
  workspace: BitBucketWorkspace,
  existingWorkspaceRecord?: Deno.KvEntryMaybe<BitBucketWorkspace>,
  existingWorkspaceNameByClientKeyRecord?: Deno.KvEntryMaybe<string>,
): Promise<boolean> {
  const key = [
    TableNames.BitBucketWorkspace,
    workspace.name,
  ];

  let staged = mainKV.atomic();

  if (existingWorkspaceRecord) {
    staged = staged.check(existingWorkspaceRecord);
  }
  if (existingWorkspaceNameByClientKeyRecord) {
    staged = staged.check(existingWorkspaceNameByClientKeyRecord);
  }

  staged = staged.set(key, workspace);
  if (workspace.securityContext) {
    const nameByClientKeyKey = [
      TableNames.BitBucketWorkspaceNameByClientKey,
      workspace.securityContext.clientKey,
    ];
    staged = staged.set(nameByClientKeyKey, workspace.name);
  }

  const { ok } = await staged.commit();
  return ok;
}

/**
 * Removes the security context record on the BitBucket Workspace and also deletes all associated config data.
 */
export async function removeSecurityContextForBitBucketWorkspace(
  existingWorkspaceRecord: Deno.KvEntryMaybe<BitBucketWorkspace>,
): Promise<void> {
  if (!existingWorkspaceRecord.value) {
    throw new Error(
      "removeSecurityContextForBitBucketWorkspace only works on records with a workspace value",
    );
  }
  if (existingWorkspaceRecord.value.securityContext === null) {
    // Do nothing since already removed.
    return;
  }

  let staged = mainKV.atomic()
    .check(existingWorkspaceRecord);

  const existingClientKey =
    existingWorkspaceRecord.value.securityContext.clientKey;
  const existingIdx = await getBitBucketWorkspaceNameByClientKey(
    existingClientKey,
  );
  if (existingIdx.value) {
    staged = staged.check(existingIdx)
      .delete(existingIdx.key);
  }

  const ws = { ...existingWorkspaceRecord.value };
  ws.securityContext = null;

  const { ok } = await staged
    .set([TableNames.BitBucketWorkspace, ws.name], ws)
    .delete([TableNames.FensakConfig, FensakConfigSource.BitBucket, ws.name])
    .commit();
  if (!ok) {
    throw new Error(
      `Could not remove installation for BitBucket workspace ${ws.name}`,
    );
  }
}

/**
 * Stores the computed fensak configuration for the given org. If a subscriptionID is passed in, then this will
 * atomically increment the repo count on the associated subscription object.
 */
export async function storeComputedFensakConfig(
  cfgSrc: FensakConfigSource,
  orgName: string,
  cfg: ComputedFensakConfig,
  subscriptionID?: string,
): Promise<void> {
  const cfgKey = [TableNames.FensakConfig, cfgSrc, orgName];
  if (!subscriptionID) {
    await mainKV.set(cfgKey, cfg);
    return;
  }

  const existingSub = await getSubscription(subscriptionID);
  if (!existingSub.value) {
    // Fail loudly since this is a bug condition.
    throw new Error(
      "storeComputedFensakConfig expects an existing subscription object when subscriptionID is set",
    );
  }
  const sub = { ...existingSub.value };
  const orgRepoCount = Object.keys(cfg.orgConfig.repos).length;
  sub.repoCount[orgName] = orgRepoCount;
  const { ok } = await mainKV.atomic()
    .check(existingSub)
    .set(existingSub.key, sub)
    .set(cfgKey, cfg)
    .commit();
  if (!ok) {
    throw new Error(
      `Could not store fensak config and update subscription repo count for GitHub org ${orgName}`,
    );
  }
}

/**
 * Retrieves the stored computed fensak configuration for the given org.
 * This will return null if there is no entry in the database (indicating a cache miss).
 */
export async function getComputedFensakConfig(
  cfgSrc: FensakConfigSource,
  orgName: string,
): Promise<ComputedFensakConfig | null> {
  const entry = await mainKV.get<ComputedFensakConfig>([
    TableNames.FensakConfig,
    cfgSrc,
    orgName,
  ]);
  if (!entry.value) {
    return null;
  }
  return entry.value;
}
