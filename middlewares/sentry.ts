// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Context, Sentry } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

const appEnv = config.get("env");
const sentryEnabled = config.get("logging.sentry.enabled");
const sentryDSN = config.get("logging.sentry.dsn");

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDSN,
    environment: appEnv,
  });
}

export const sentryReportError: Middleware = async (
  _ctx: Context,
  next: Next,
): Promise<void> => {
  try {
    await next();
  } catch (e) {
    Sentry.captureException(e);
    throw e;
  }
};
