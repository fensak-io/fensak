// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Application, basemiddlewares, config, Router } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import { flushLoki as flushLokiMiddleware } from "../middlewares/mod.ts";

import { attachRoutes } from "./routes.ts";
import { attachMgmtAPIRoutes } from "./mgmt_routes.ts";

const enableMgmtAPI = config.get("managementAPI.enabled");

export async function startWebServer(): Promise<void> {
  const app = new Application();

  app.use(flushLokiMiddleware);
  app.use(basemiddlewares.newLoggerMiddleware(logger));
  app.use(basemiddlewares.newErrorMiddleware(logger));
  app.use(basemiddlewares.timing);
  app.use(basemiddlewares.requestId);
  app.use(basemiddlewares.unsupportedRoute);

  const router = new Router();
  attachRoutes(router);
  if (enableMgmtAPI) {
    attachMgmtAPIRoutes(router);
  }
  app.use(router.routes());
  app.use(router.allowedMethods());

  const port = 8080;
  logger.info(`Listening on 0.0.0.0:${port}`);
  await app.listen({ port });
}
