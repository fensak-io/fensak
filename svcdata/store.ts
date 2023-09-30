// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { crypto } from "../deps.ts";

import { mainKV } from "./svc.ts";
import { ComputedFensakConfig, GitHubOrg, Lock } from "./models.ts";

enum TableNames {
  GitHubOrg = "github_org",
  FensakConfig = "fensak_config",
  Lock = "lock",
}

export enum FensakConfigSource {
  GitHub = "github",
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
    console.warn(
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
export async function deleteGitHubOrg(orgName: string): Promise<void> {
  const ok = await mainKV.atomic()
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
 * Stores the computed fensak configuration for the given org.
 */
export async function storeComputedFensakConfig(
  cfgSrc: FensakConfigSource,
  orgName: string,
  cfg: ComputedFensakConfig,
): Promise<void> {
  await mainKV.set([TableNames.FensakConfig, cfgSrc, orgName], cfg);
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
