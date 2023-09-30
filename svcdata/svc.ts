// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

// Export a handle to the main KV store. This is only used internal to the package to ensure the same handle is being
// used by all the functions (and thus is not reexported in mod.ts like all other functions).
export const mainKV = await Deno.openKv();
