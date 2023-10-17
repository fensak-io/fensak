import { config, Context } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

import { lokiTransport } from "../logging/mod.ts";

const lokiEnabled = config.get("logging.loki.enabled");

/**
 * A middleware to flush Loki logs (if it is enabled).
 */
export const flushLoki: Middleware = async (
  _ctx: Context,
  next: Next,
): Promise<void> => {
  await next();

  if (lokiEnabled) {
    await lokiTransport.flush();
  }
};
