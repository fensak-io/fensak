// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";

import {
  deleteSubscription,
  getGitHubOrgRecord,
  getSubscription,
  storeGitHubOrg,
  storeSubscription,
} from "../svcdata/mod.ts";
import type { GitHubOrg } from "../svcdata/mod.ts";
import { logger } from "../logging/mod.ts";

const plansAllowedMultipleOrgs = config.get("plansAllowedMultipleOrgs");

enum EventType {
  SubscriptionCreated = "subscription.created",
  SubscriptionCancelled = "subscription.cancelled",
  SubscriptionUpdated = "subscription.updated",
  SubscriptionLinked = "subscription.linked",
  SubscriptionUnlinked = "subscription.unlinked",
}

interface SubscriptionEvent {
  id: string;
  mainOrgName: string;
  planName: string;
  cancelledAt: number;
}

interface SubscriptionLinkUnlinkEvent {
  id: string;
  orgName: string;
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
    `Received new subscription ${data.id} for org ${data.mainOrgName} with ${data.planName} plan`,
  );

  const newSub = {
    id: data.id,
    mainOrgName: data.mainOrgName,
    planName: data.planName,
    repoCount: 0,
    cancelledAt: 0,
  };
  const stored = await storeSubscription(newSub, maybeSub);
  if (!stored) {
    throw new Error(`Failed to record new subscription ${data.id}`);
  }

  logger.info(
    `Successfully handled new subscription request ${data.id} for org ${data.mainOrgName} with ${data.planName} plan`,
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
  sub.mainOrgName = data.mainOrgName;
  sub.planName = data.planName;
  sub.cancelledAt = data.cancelledAt;
  const stored = await storeSubscription(sub, maybeSub);
  if (!stored) {
    throw new Error(`Failed to update subscription ${data.id}`);
  }

  logger.info(
    `Successfully handled updated subscription request ${data.id} for org ${data.mainOrgName}`,
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
    `Successfully handled cancel subscription request ${data.id} for org ${data.mainOrgName}`,
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
  if (!plansAllowedMultipleOrgs.includes(maybeSub.value.planName)) {
    logger.warn(
      `Received link subscription event for sub (${data.id}) with plan (${maybeSub.value.planName}) that is not allowed to link multiple subs. Ignoring event.`,
    );
    return;
  }

  const orgRecord = await getGitHubOrgRecord(data.orgName);
  let org: GitHubOrg;
  if (!orgRecord.value) {
    // Create a new org
    org = {
      name: data.orgName,
      installationID: null,
      subscriptionID: maybeSub.value.id,
    };
  } else {
    // Link subscription to the existing Org
    org = { ...orgRecord.value };
    if (org.subscriptionID && org.subscriptionID != data.id) {
      logger.warn(
        `Received link subscription event for org (${data.orgName}) that already has a subscription ${org.subscriptionID}. Ignoring event.`,
      );
      return;
    } else if (org.subscriptionID && org.subscriptionID === data.id) {
      logger.warn(
        `Received link subscription event for org (${data.orgName}) that is already linked to ${data.id}. Ignoring event.`,
      );
      return;
    }

    org.subscriptionID = data.id;
  }

  const stored = await storeGitHubOrg(org, orgRecord);
  if (!stored) {
    throw new Error(
      `Failed to link subscription ${data.id} to org ${data.orgName}`,
    );
  }

  logger.info(
    `Successfully handled link subscription request ${data.id} for org ${data.orgName}`,
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
  const orgRecord = await getGitHubOrgRecord(data.orgName);
  if (!orgRecord.value) {
    logger.warn(
      `Received unlink subscription event for a non-existing org (${data.orgName}). Ignoring event.`,
    );
    return;
  }
  const org = { ...orgRecord.value };

  if (!org.subscriptionID || org.subscriptionID != data.id) {
    logger.warn(
      `Received unlink subscription event for org (${data.orgName}) on wrong subscription (${org.subscriptionID} != ${data.id}). Ignoring event.`,
    );
    return;
  }

  org.subscriptionID = null;
  const stored = await storeGitHubOrg(org, orgRecord);
  if (!stored) {
    throw new Error(
      `Failed to unlink subscription ${data.id} from org ${data.orgName}`,
    );
  }

  logger.info(
    `Successfully handled unlink subscription request ${data.id} for org ${data.orgName}`,
  );
}
