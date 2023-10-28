// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { atlassianjwt, config, http, jwt } from "../deps.ts";

import type {
  BitBucketSecurityContext,
  BitBucketWorkspace,
  BitBucketWorkspaceWithSubscription,
} from "../svcdata/mod.ts";

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

export type BitBucketAPIOptions = {
  baseUrl?: string;
  securityContext?: BitBucketSecurityContext;
};

export class BitBucket {
  #securityContext?: BitBucketSecurityContext;
  #baseURL: string;

  constructor(options: BitBucketAPIOptions = {}) {
    this.#baseURL = options.baseUrl || "https://api.bitbucket.org";
    this.#securityContext = options.securityContext;
  }

  static fromWorkspace(
    ws: BitBucketWorkspace | BitBucketWorkspaceWithSubscription,
  ): BitBucket {
    if (ws.securityContext === null) {
      throw new Error(
        `Can not initialize bitbucket client for workspace ${ws.name}: no security context`,
      );
    }

    return new BitBucket({
      baseUrl: ws.securityContext.baseApiUrl,
      securityContext: ws.securityContext,
    });
  }

  /**
   * Sets an override url endpoint for BitBucket API calls.
   * @param apiURL url endpoint for the BitBucket API used for api calls. It should include the protocol, the domain and the path.
   * @example: "https://api.bitbucket.org"
   * @returns BitBucket
   */
  setBitBucketApiUrl(apiURL: string) {
    this.#baseURL = apiURL;

    return this;
  }

  async directAPICall(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.#securityContext) {
      const token = await generateSessionToken(
        this.#securityContext,
        "GET",
        url,
      );
      headers.Authorization = `JWT ${token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      const text = await response.text();
      throw http.createHttpError(
        response.status,
        `${response.status}: ${text}`,
        { headers: response.headers },
      );
    }
    return response;
  }

  async apiCall(
    path: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    // deno-lint-ignore no-explicit-any
    data: any = {},
  ): Promise<Response> {
    // ensure there's a slash prior to path
    const url = `${this.#baseURL.replace(/\/$/, "")}/${path}`;
    // deno-lint-ignore no-explicit-any
    let body: any = undefined;
    if (method === "POST") {
      body = JSON.stringify(data);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.#securityContext) {
      const token = await generateSessionToken(
        this.#securityContext,
        method,
        url,
      );
      headers.Authorization = `JWT ${token}`;
    }

    const response = await fetch(url, {
      method: method,
      headers: headers,
      body,
    });
    if (!response.ok) {
      const text = await response.text();
      throw http.createHttpError(
        response.status,
        `${response.status}: ${text}`,
        { headers: response.headers },
      );
    }
    return response;
  }
}

async function generateSessionToken(
  sctx: BitBucketSecurityContext,
  method: "GET" | "POST" | "DELETE",
  urlRaw: string,
): Promise<string> {
  const req: atlassianjwt.Request = atlassianjwt.fromMethodAndUrl(
    method,
    urlRaw,
  );
  const qsh = atlassianjwt.createQueryStringHash(req);

  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(sctx.sharedSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );

  const now = Date.now();
  return await jwt.create(
    { alg: "HS256", typ: "JWT" },
    {
      iss: getBitBucketAppKey(),
      iat: now,
      exp: now + 600 * 1000, // 5 minutes
      sub: sctx.clientKey,
      qsh,
    },
    key,
  );
}
