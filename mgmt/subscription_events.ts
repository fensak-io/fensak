// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";

import {
  deleteSubscription,
  getBitBucketWorkspace,
  getGitHubOrgRecord,
  getSubscription,
  storeBitBucketWorkspace,
  storeGitHubOrg,
  storeSubscription,
} from "../svcdata/mod.ts";
import type { BitBucketWorkspace, GitHubOrg } from "../svcdata/mod.ts";
import { logger } from "../logging/mod.ts";

const plansAllowedMultipleAccounts = config.get("plansAllowedMultipleAccounts");

enum EventType {
  SubscriptionCreated = "subscription.created",
  SubscriptionCancelled = "subscription.cancelled",
  SubscriptionUpdated = "subscription.updated",
  SubscriptionLinked = "subscription.linked",
  SubscriptionUnlinked = "subscription.unlinked",
}

interface SubscriptionEvent {
  id: string;
  mainAccountSource: "github" | "bitbucket";
  mainAccountName: string;
  planName: string;
  cancelledAt: number;
}

interface SubscriptionLinkUnlinkEvent {
  id: string;
  accountSource: "github" | "bitbucket";
  accountName: string;
}

// deno-lint-ignore no-explicit-any
export async function handleSubscriptionEvent(payload: any): Promise<void> {
  if (!payload.eventType) {
    throw new Error("subscription event payload missing type");
  }
  switch (payload.eventType) {
    case EventType.SubscriptionCreated:
      await handleSubscriptionCreatedEvent(payload.data as SubscriptionEvent);
      return;

    case EventType.SubscriptionCancelled:
      await handleSubscriptionCancelledEvent(payload.data as SubscriptionEvent);
      return;

    case EventType.SubscriptionUpdated:
      await handleSubscriptionUpdatedEvent(payload.data as SubscriptionEvent);
      return;

    case EventType.SubscriptionLinked:
      await handleSubscriptionLinkedEvent(
        payload.data as SubscriptionLinkUnlinkEvent,
      );
      return;

    case EventType.SubscriptionUnlinked:
      await handleSubscriptionUnlinkedEvent(
        payload.data as SubscriptionLinkUnlinkEvent,
      );
      return;
  }
}

async function handleSubscriptionCreatedEvent(
  data: SubscriptionEvent,
): Promise<void> {
  const maybeSub = await getSubscription(data.id);
  if (maybeSub.value) {
    logger.warn(
      `Received new subscription event for existing sub (${data.id}). Ignoring event.`,
    );
    return;
  }

  logger.debug(
    `Received new subscription ${data.id} for org ${data.mainAccountName} (${data.mainAccountSource}) with ${data.planName} plan`,
  );

  const newSub = {
    id: data.id,
    mainOrgSource: data.mainAccountSource,
    mainOrgName: data.mainAccountName,
    planName: data.planName,
    repoCount: {},
    cancelledAt: 0,
  };
  const stored = await storeSubscription(newSub, maybeSub);
  if (!stored) {
    throw new Error(`Failed to record new subscription ${data.id}`);
  }

  logger.info(
    `Successfully handled new subscription request ${data.id} for org ${data.mainAccountName} (${data.mainAccountSource}) with ${data.planName} plan`,
  );
}

async function handleSubscriptionUpdatedEvent(
  data: SubscriptionEvent,
): Promise<void> {
  const maybeSub = await getSubscription(data.id);
  if (!maybeSub.value) {
    logger.warn(
      `Received update subscription event for a non-existing sub (${data.id}). Ignoring event.`,
    );
    return;
  }

  const sub = { ...maybeSub.value };
  sub.mainOrgSource = data.mainAccountSource;
  sub.mainOrgName = data.mainAccountName;
  sub.planName = data.planName;
  sub.cancelledAt = data.cancelledAt;
  const stored = await storeSubscription(sub, maybeSub);
  if (!stored) {
    throw new Error(`Failed to update subscription ${data.id}`);
  }

  logger.info(
    `Successfully handled updated subscription request ${data.id} for org ${data.mainAccountName} (${data.mainAccountSource})`,
  );
}

async function handleSubscriptionCancelledEvent(
  data: SubscriptionEvent,
): Promise<void> {
  const maybeSub = await getSubscription(data.id);
  if (!maybeSub.value) {
    logger.warn(
      `Received cancel subscription event for a non-existing sub (${data.id}). Ignoring event.`,
    );
    return;
  }

  await deleteSubscription(data.id);

  logger.info(
    `Successfully handled cancel subscription request ${data.id} for org ${data.mainAccountName} (${data.mainAccountSource})`,
  );
}

async function handleSubscriptionLinkedEvent(
  data: SubscriptionLinkUnlinkEvent,
): Promise<void> {
  const maybeSub = await getSubscription(data.id);
  if (!maybeSub.value) {
    logger.warn(
      `Received link subscription event for a non-existing sub (${data.id}). Ignoring event.`,
    );
    return;
  }
  if (!plansAllowedMultipleAccounts.includes(maybeSub.value.planName)) {
    logger.warn(
      `Received link subscription event for sub (${data.id}) with plan (${maybeSub.value.planName}) that is not allowed to link multiple accounts. Ignoring event.`,
    );
    return;
  }

  switch (data.accountSource) {
    case "bitbucket": {
      const wsRecord = await getBitBucketWorkspace(data.accountName);
      let ws: BitBucketWorkspace;
      if (!wsRecord.value) {
        // Create a new Workspace
        ws = {
          name: data.accountName,
          subscriptionID: maybeSub.value.id,
          securityContext: null,
        };
      } else {
        // Link subscription to the existing Workspace
        ws = { ...wsRecord.value };
        if (ws.subscriptionID && ws.subscriptionID != data.id) {
          logger.warn(
            `Received link subscription event for BitBucket workspace (${data.accountName}) that already has a subscription ${ws.subscriptionID}. Ignoring event.`,
          );
          return;
        } else if (ws.subscriptionID && ws.subscriptionID === data.id) {
          logger.warn(
            `Received link subscription event for BitBucket workspace (${data.accountName}) that is already linked to ${data.id}. Ignoring event.`,
          );
          return;
        }

        ws.subscriptionID = data.id;
      }

      const stored = await storeBitBucketWorkspace(ws, wsRecord);
      if (!stored) {
        throw new Error(
          `Failed to link subscription ${data.id} to BitBucket workspace ${data.accountName}`,
        );
      }

      break;
    }

    case "github": {
      const orgRecord = await getGitHubOrgRecord(data.accountName);
      let org: GitHubOrg;
      if (!orgRecord.value) {
        // Create a new org
        org = {
          name: data.accountName,
          installationID: null,
          subscriptionID: maybeSub.value.id,
        };
      } else {
        // Link subscription to the existing Org
        org = { ...orgRecord.value };
        if (org.subscriptionID && org.subscriptionID != data.id) {
          logger.warn(
            `Received link subscription event for GitHub org (${data.accountName}) that already has a subscription ${org.subscriptionID}. Ignoring event.`,
          );
          return;
        } else if (org.subscriptionID && org.subscriptionID === data.id) {
          logger.warn(
            `Received link subscription event for GitHub org (${data.accountName}) that is already linked to ${data.id}. Ignoring event.`,
          );
          return;
        }

        org.subscriptionID = data.id;
      }

      const stored = await storeGitHubOrg(org, orgRecord);
      if (!stored) {
        throw new Error(
          `Failed to link subscription ${data.id} to GitHub org ${data.accountName}`,
        );
      }

      break;
    }
  }

  logger.info(
    `Successfully handled link subscription request ${data.id} for GitHub org ${data.accountName}`,
  );
}

async function handleSubscriptionUnlinkedEvent(
  data: SubscriptionLinkUnlinkEvent,
): Promise<void> {
  const maybeSub = await getSubscription(data.id);
  if (!maybeSub.value) {
    logger.warn(
      `Received unlink subscription event for a non-existing sub (${data.id}). Ignoring event.`,
    );
    return;
  }

  switch (data.accountSource) {
    case "bitbucket": {
      const wsRecord = await getBitBucketWorkspace(data.accountName);
      if (!wsRecord.value) {
        logger.warn(
          `Received unlink subscription event for a non-existing BitBucket workspace (${data.accountName}). Ignoring event.`,
        );
        return;
      }
      const ws: BitBucketWorkspace = { ...wsRecord.value };

      if (!ws.subscriptionID || ws.subscriptionID != data.id) {
        logger.warn(
          `Received unlink subscription event for BitBucket workspace (${data.accountName}) on wrong subscription (${ws.subscriptionID} != ${data.id}). Ignoring event.`,
        );
        return;
      }

      ws.subscriptionID = null;
      const stored = await storeBitBucketWorkspace(ws, wsRecord);
      if (!stored) {
        throw new Error(
          `Failed to unlink subscription ${data.id} from BitBucket workspace ${data.accountName}`,
        );
      }

      break;
    }

    case "github": {
      const orgRecord = await getGitHubOrgRecord(data.accountName);
      if (!orgRecord.value) {
        logger.warn(
          `Received unlink subscription event for a non-existing GitHub org (${data.accountName}). Ignoring event.`,
        );
        return;
      }
      const org: GitHubOrg = { ...orgRecord.value };

      if (!org.subscriptionID || org.subscriptionID != data.id) {
        logger.warn(
          `Received unlink subscription event for GitHub org (${data.accountName}) on wrong subscription (${org.subscriptionID} != ${data.id}). Ignoring event.`,
        );
        return;
      }

      org.subscriptionID = null;
      const stored = await storeGitHubOrg(org, orgRecord);
      if (!stored) {
        throw new Error(
          `Failed to unlink subscription ${data.id} from GitHub org ${data.accountName}`,
        );
      }

      break;
    }
  }

  logger.info(
    `Successfully handled unlink subscription request ${data.id} for org ${data.accountName}`,
  );
}
