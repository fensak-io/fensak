import { startWorker } from "./worker/mod.ts";
import { startWebServer } from "./web/mod.ts";

startWorker();
await startWebServer();
