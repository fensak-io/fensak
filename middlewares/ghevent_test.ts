// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import {
  assertEquals,
  assertNotEquals,
  oakTesting,
  path,
  Request,
} from "../test_deps.ts";
import { Status } from "../deps.ts";
import type { ServerRequestBody } from "../test_deps.ts";

import { assertGitHubWebhook } from "./ghevent.ts";

const __dirname = path.dirname(path.fromFileUrl(import.meta.url));
const fixturePingEventTxt = await Deno.readTextFile(
  path.join(__dirname, "./fixtures/pingevent.json"),
);
const fixturePingEvent = JSON.parse(fixturePingEventTxt);

Deno.test("ghevent middleware rejects no signature", async () => {
  const body = JSON.stringify(fixturePingEvent.payload);

  const ctx = oakTesting.createMockContext({});
  const request = new Request({
    remoteAddr: undefined,
    headers: new Headers({
      "content-type": "text/json",
      "content-length": String(body.length),
      "host": "localhost",
    }),
    method: "POST",
    url: "/hooks/gh",
    // deno-lint-ignore no-explicit-any
    error(_reason?: any) {},
    getBody(): ServerRequestBody {
      return {
        body: null,
        readBody: () => Promise.resolve(new TextEncoder().encode(body)),
      };
    },
    respond: (_response: Response) => Promise.resolve(),
  });
  ctx.request = request;
  const next = oakTesting.createMockNext();

  await assertGitHubWebhook(ctx, next);

  assertEquals(ctx.response.status, Status.Forbidden);
});

Deno.test("ghevent middleware rejects wrong signature", async () => {
  const body = JSON.stringify(fixturePingEvent.payload);

  const ctx = oakTesting.createMockContext({});
  const request = new Request({
    remoteAddr: undefined,
    headers: new Headers({
      "content-type": "text/json",
      "content-length": String(body.length),
      "host": "localhost",
      "x-hub-signature-256":
        "sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
    method: "POST",
    url: "/hooks/gh",
    // deno-lint-ignore no-explicit-any
    error(_reason?: any) {},
    getBody(): ServerRequestBody {
      return {
        body: null,
        readBody: () => Promise.resolve(new TextEncoder().encode(body)),
      };
    },
    respond: (_response: Response) => Promise.resolve(),
  });
  ctx.request = request;
  const next = oakTesting.createMockNext();

  await assertGitHubWebhook(ctx, next);

  assertEquals(ctx.response.status, Status.Forbidden);
});

Deno.test("ghevent middleware accepts valid request with signature", async () => {
  const body = JSON.stringify(fixturePingEvent.payload);

  const ctx = oakTesting.createMockContext({});
  const request = new Request({
    remoteAddr: undefined,
    headers: new Headers({
      "content-type": "text/json",
      "content-length": String(body.length),
      "host": "localhost",
      ...fixturePingEvent.headers,
    }),
    method: "POST",
    url: "/hooks/gh",
    // deno-lint-ignore no-explicit-any
    error(_reason?: any) {},
    getBody(): ServerRequestBody {
      return {
        body: null,
        readBody: () => Promise.resolve(new TextEncoder().encode(body)),
      };
    },
    respond: (_response: Response) => Promise.resolve(),
  });
  ctx.request = request;
  const next = oakTesting.createMockNext();

  await assertGitHubWebhook(ctx, next);

  assertNotEquals(ctx.response.status, Status.Forbidden);
});
