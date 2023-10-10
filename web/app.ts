// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Application, config, Router } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import * as middlewares from "../middlewares/mod.ts";

import { attachRoutes } from "./routes.ts";
import { attachMgmtAPIRoutes } from "./mgmt_routes.ts";

const enableMgmtAPI = config.get("managementAPI.enabled");

export async function startWebServer(): Promise<void> {
  const app = new Application();

  app.use(middlewares.logger);
  app.use(middlewares.error);
  app.use(middlewares.timing);
  app.use(middlewares.requestId);
  app.use(middlewares.unsupportedRoute);

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
