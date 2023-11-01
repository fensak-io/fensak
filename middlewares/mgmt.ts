// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { base64, config, Context, Status } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

import { octokitFromOauthApp } from "../ghauth/mod.ts";
import { verifyMgmtEvent } from "../mgmt/mod.ts";
import { logger } from "../logging/mod.ts";

import { returnUnauthorizedResp } from "./common_resps.ts";

const githubOauthClientID = config.get("github.oauthApp.clientID");
const allSharedCryptoKeys = config.get(
  "managementAPI.sharedCryptoEncryptionKeys",
);
const latestSharedCryptoKeyRaw =
  allSharedCryptoKeys[allSharedCryptoKeys.length - 1];
const encLatestSharedCryptoKeyRaw = new TextEncoder().encode(
  latestSharedCryptoKeyRaw,
);
const latestSharedCryptoKey = await crypto.subtle.importKey(
  "raw",
  encLatestSharedCryptoKeyRaw,
  { name: "AES-CBC" },
  false,
  ["encrypt", "decrypt"],
);
// NOTE
// It is known that this is less secure than using a random IV. However, having a constant known IV is necessary in
// order to be able to decrypt the payload that is encrypted on an external service (the Dashboard service). Perhaps in
// the future we can work around this using some shared cookie, but for now, this is ok since the goal isn't to guard
// the secret, but rather to ensure that the token was generated on a known service.
const sharedIV = new Uint8Array(16);
for (let i = 0; i < 16; i++) {
  sharedIV[i] = encLatestSharedCryptoKeyRaw[i];
}

export enum APITokenSource {
  GitHub = 0,
  BitBucket = 10,
}

export const assertMgmtEvent: Middleware = async (
  ctx: Context,
  next: Next,
): Promise<void> => {
  const fskSig = ctx.request.headers.get("X-Fsk-Signature-256");
  if (fskSig == null) {
    returnInvalidFskEventHook(ctx);
    return;
  }

  const body = ctx.request.body({ type: "text" });
  const bodyText = await body.value;
  const isValid = await verifyMgmtEvent(bodyText, fskSig);
  if (!isValid) {
    returnInvalidFskEventHook(ctx);
    return;
  }

  await next();
};

export const assertMgmtAPIToken: Middleware = async (
  ctx: Context,
  next: Next,
): Promise<void> => {
  const auth = ctx.request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    logger.debug(`Authorization header missing or is not bearer`);
    returnUnauthorizedResp(ctx);
    return;
  }

  const token = auth.replace(/^Bearer /, "");
  if (token.startsWith("gho_")) {
    const octokit = octokitFromOauthApp();
    let resp;
    try {
      resp = await octokit.apps.checkToken({
        client_id: githubOauthClientID,
        access_token: token,
      });
    } catch (e) {
      logger.debug(`Error checking token: ${e}`);
      returnUnauthorizedResp(ctx);
      return;
    }
    if (!resp.data.user) {
      logger.debug("Token data doesn't have a user");
      returnUnauthorizedResp(ctx);
      return;
    }

    ctx.state.apiAuthedUser = resp.data.user.login;
    ctx.state.apiTokenSource = APITokenSource.GitHub;
    ctx.state.apiToken = token;
  } else {
    // Assume bitbucket token. In the future, update the encrypted bitbucket token exchange so that it is prefixed with
    // a known string (like gho).
    const rawToken = await sharedDecrypt(token);
    const accessToken = JSON.parse(rawToken);
    const resp = await fetch(
      "https://api.bitbucket.org/2.0/user",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken.access_token}`,
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) {
      const rtext = await resp.text();
      logger.debug(`Error checking token: ${rtext}`);
      returnUnauthorizedResp(ctx);
      return;
    }
    const data = await resp.json();

    ctx.state.apiAuthedUser = data.username;
    ctx.state.apiTokenSource = APITokenSource.BitBucket;
    ctx.state.apiToken = accessToken.access_token;
  }

  await next();
};

function returnInvalidFskEventHook(ctx: Context): void {
  const respStatus = Status.Forbidden;
  ctx.response.status = respStatus;
  ctx.response.body = {
    status: respStatus,
    msg: "Could not verify fensak signature.",
  };
}

async function sharedDecrypt(enc: string): Promise<string> {
  const payload = base64.decode(enc);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", length: 256, iv: sharedIV },
    latestSharedCryptoKey,
    payload,
  );
  return new TextDecoder().decode(decrypted);
}
