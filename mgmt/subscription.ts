// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import {
  deleteSubscription,
  getSubscription,
  storeSubscription,
} from "../svcdata/mod.ts";
import { logger } from "../logging/mod.ts";

enum EventType {
  SubscriptionCreated = "subscription.created",
  SubscriptionCancelled = "subscription.cancelled",
  SubscriptionUpdated = "subscription.updated",
}

interface SubscriptionEvent {
  id: string;
  mainOrgName: string;
  planName: string;
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

  const newSub = {
    id: data.id,
    mainOrgName: data.mainOrgName,
    planName: data.planName,
    repoCount: 0,
  };
  const stored = await storeSubscription(newSub, maybeSub);
  if (!stored) {
    throw new Error(`Failed to record new subscription ${data.id}`);
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
