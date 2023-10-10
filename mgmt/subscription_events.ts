// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import {
  deleteSubscription,
  getGitHubOrgRecord,
  getSubscription,
  storeGitHubOrg,
  storeSubscription,
} from "../svcdata/mod.ts";
import { logger } from "../logging/mod.ts";

enum EventType {
  SubscriptionCreated = "subscription.created",
  SubscriptionCancelled = "subscription.cancelled",
  SubscriptionUpdated = "subscription.updated",
  SubscriptionUnlinked = "subscription.unlinked",
}

interface SubscriptionEvent {
  id: string;
  mainOrgName: string;
  planName: string;
  cancelledAt: number;
}

interface SubscriptionUnlinkEvent {
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

    case EventType.SubscriptionUnlinked:
      await handleSubscriptionUnlinkedEvent(
        payload.data as SubscriptionUnlinkEvent,
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
}

async function handleSubscriptionUnlinkedEvent(
  data: SubscriptionUnlinkEvent,
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
}
