// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, winston, WinstonLoki, WinstonTransport } from "../deps.ts";

const serviceEnv = config.get("env");
const loggingLevel = config.get("logging.level");
const lokiEnabled = config.get("logging.loki.enabled");
const lokiHost = config.get("logging.loki.host");
const lokiAuth = config.get("logging.loki.basicAuth");
export let lokiTransport: WinstonLoki;
if (lokiEnabled) {
  lokiTransport = new WinstonLoki({
    host: lokiHost,
    basicAuth: lokiAuth,
    replaceTimestamp: true,
    json: true,
    labels: {
      service: "fensak",
      env: serviceEnv,
    },
  });
}

export const logger = initializeLogger();

export function logConfig(): void {
  logger.info("Configured settings for this environment:");
  logger.info(`configFileSizeLimit: ${config.get("configFileSizeLimit")}`);
  logger.info(`rulesFileSizeLimit: ${config.get("rulesFileSizeLimit")}`);
  if (lokiEnabled) {
    logger.info(`Shipping logs to Loki host: ${lokiHost}`);
  }

  const repoLimits = config.get("planRepoLimits");
  logger.info("planRepoLimits:");
  for (const key in repoLimits) {
    logger.info(`\t- ${key}: ${repoLimits[key]}`);
  }

  const plansAllowedMultipleOrgs = config.get("plansAllowedMultipleOrgs");
  if (plansAllowedMultipleOrgs.length > 0) {
    logger.info("plansAllowedMultipleOrgs:");
    for (const plan of plansAllowedMultipleOrgs) {
      logger.info(`\t- ${plan}`);
    }
  } else {
    logger.info("No plans allowed multiple orgs");
  }

  logger.info(`GitHub App: ${config.get("github.app.appID")}`);

  const activeSubscriptionPlanRequired = config.get(
    "activeSubscriptionPlanRequired",
  );
  if (activeSubscriptionPlanRequired) {
    logger.info("Users must have an active Subscription plan");
  }

  const allowedOrgs = config.get("github.allowedOrgs");
  if (allowedOrgs) {
    logger.info("Only the following GitHub Orgs may use this instance:");
    for (const o of allowedOrgs) {
      logger.info(`- ${o}`);
    }
  }

  logger.info("END CONFIGURED SETTINGS");
}

function initializeLogger(): winston.Logger {
  const transports: WinstonTransport[] = [
    new winston.transports.Console({ format: winston.format.simple() }),
  ];
  if (lokiEnabled) {
    transports.push(lokiTransport);
  }
  return winston.createLogger({
    level: loggingLevel,
    format: winston.format.json(),
    defaultMeta: {
      service: "fensak-app",
      env: serviceEnv,
    },
    transports: transports,
  });
}
