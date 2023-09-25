import { Application, Context, Router } from "../deps.ts";
import * as middlewares from "../middlewares/mod.ts";

export async function startWebServer(): Promise<void> {
  const app = new Application();

  app.use(middlewares.logger);
  app.use(middlewares.error);
  app.use(middlewares.timing);
  app.use(middlewares.requestId);
  app.use(middlewares.unsupportedRoute);

  const router = new Router();
  router
    .post("/hooks/gh", middlewares.assertGitHubWebhook, (ctx: Context) => {
      ctx.response.body = "Hello World!";
    });
  app.use(router.routes());
  app.use(router.allowedMethods());

  const port = 8080;
  console.log(`Listening on 0.0.0.0:${port}`);
  await app.listen({ port });
}
