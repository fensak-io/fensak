import { Context, crypto, Status } from "../deps.ts";
import type { Next } from "../deps.ts";

export async function requestId(ctx: Context, next: Next): Promise<void> {
  let requestId = ctx.request.headers.get("X-Response-Id");
  if (!requestId) {
    /** if request id not being set, set unique request id */
    requestId = crypto.randomUUID();
    if (requestId == null) {
      throw new Error("Could not generate unique ID");
    }
  }
  ctx.state.requestId = requestId.toString();

  await next();

  /** add request id in response header */
  ctx.response.headers.set("X-Response-Id", requestId.toString());
}

export async function timing(ctx: Context, next: Next): Promise<void> {
  const start = Date.now();

  await next();

  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
}

export async function error(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err) {
    const status = err.status || err.statusCode || Status.InternalServerError;

    console.log(err.message);

    ctx.response.status = status;
    ctx.response.body = { status, msg: "internal server error" };
  }
}

export async function logger(ctx: Context, next: Next): Promise<void> {
  await next();

  const reqTime = ctx.response.headers.get("X-Response-Time");
  const reqId = ctx.response.headers.get("X-Response-Id");
  const status = ctx.response.status;
  console.log(
    `${reqId} ${ctx.request.method} ${ctx.request.url} - status: ${status} (${reqTime})`,
  );
}
