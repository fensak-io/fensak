import { Context, crypto, Status } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

const requestId: Middleware = async (ctx: Context, next: Next) => {
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
};

const timing: Middleware = async (ctx: Context, next: Next) => {
  const start = Date.now();

  await next();

  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
};

const error: Middleware = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    const status = err.status || err.statusCode || Status.InternalServerError;

    console.log(err.message);

    ctx.response.status = status;
    ctx.response.body = { status, msg: "internal server error" };
  }
};

const unsupportedRoute: Middleware = async (ctx: Context, next: Next) => {
  await next();

  const status = ctx.response.status;
  switch (status) {
    case Status.NotFound:
      ctx.response.body = { status, msg: "not found" };
      break;
    case Status.MethodNotAllowed:
      ctx.response.body = { status, msg: "method not allowed" };
      break;
  }
};

const logger: Middleware = async (ctx: Context, next: Next) => {
  await next();

  const reqTime = ctx.response.headers.get("X-Response-Time");
  const reqId = ctx.response.headers.get("X-Response-Id");
  const status = ctx.response.status;
  console.log(
    `${reqId} ${ctx.request.method} ${ctx.request.url} - status: ${status} (${reqTime})`,
  );
};

export { error, logger, requestId, timing, unsupportedRoute };
