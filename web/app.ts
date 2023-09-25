import { Application, Context } from "../deps.ts";
import * as middlewares from "../middlewares/mod.ts";

export async function startWebServer(): Promise<void> {
  const app = new Application();

  app.use(middlewares.logger);
  app.use(middlewares.error);
  app.use(middlewares.timing);
  app.use(middlewares.requestId);

  app.use((ctx: Context) => {
    ctx.response.body = "Hello World!";
  });

  const port = 8080;
  console.log(`Listening on 0.0.0.0:${port}`);
  await app.listen({ port });
}
