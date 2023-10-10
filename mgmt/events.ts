// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, hex, timingSafeEqual } from "../deps.ts";

const eventSecretKey = config.get("managementAPI.eventSecretKey");

/**
 * Validate the webhook event originated from an expected client by signing the request payload and checking against the
 * signature.
 *
 * The signature is an HMAC-SHA256 signature of the raw request body sent to the server.
 */
export async function verifyMgmtEvent(
  payload: string,
  signature: string,
): Promise<boolean> {
  // Compute the expected signature
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(eventSecretKey);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const data = encoder.encode(payload);
  const result = await crypto.subtle.sign("HMAC", key, data.buffer);
  const expected = hex.encodeHex(result);

  // Compare using timing safe equal
  return timingSafeEqual(encoder.encode(expected), encoder.encode(signature));
}
