// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { startWorker } from "./worker/mod.ts";
import { startWebServer } from "./web/mod.ts";

startWorker();
await startWebServer();
