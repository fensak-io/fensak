// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, jwt } from "../deps.ts";

import type { BitBucketWorkspace } from "../svcdata/mod.ts";

import { BitBucket } from "./client.ts";

const appEnv = config.get("env");

export function getBitBucketAppKey(): string {
  let key = "fensak-app-test";
  switch (appEnv) {
    case "stage":
      key = "fensak-app-stage";
      break;

    case "prod":
      key = "fensak-app";
      break;
  }
  return key;
}

export async function bitbucketFromWorkspace(
  ws: BitBucketWorkspace,
  // deno-lint-ignore no-explicit-any
  verifiedClaims: any,
  maxTokenAge: number,
): Promise<BitBucket> {
  if (ws.securityContext === null) {
    throw new Error(
      `Can not initialize bitbucket client for workspace ${ws.name}: no security context`,
    );
  }

  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(ws.securityContext.sharedSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );

  const now = Date.now();
  const token = await jwt.create(
    { alg: "HS256", typ: "JWT" },
    {
      iss: getBitBucketAppKey(),
      iat: now,
      sub: verifiedClaims.sub,
      exp: now + maxTokenAge,
      aud: [ws.securityContext.clientKey],
    },
    key,
  );
  return new BitBucket(token, { baseUrl: ws.securityContext.baseApiUrl });
}
