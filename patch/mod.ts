/**
 * patch
 * Contains types, functions, and utilities for defining and fetching patches to be used by the different rules.
 */
export * from "./patch_types.ts";
export * from "./patch.ts";
export * from "./from.ts";
export * from "./from_github.ts";

// Expose the raw src file without export keyword so that it can be injected into typescript compilation.
const __dirname = new URL(".", import.meta.url).pathname;
let patchTypesSrc = await Deno.readTextFile(
  `${__dirname}/patch_types.ts`,
);
patchTypesSrc = patchTypesSrc.replace(/export /g, "");
export { patchTypesSrc };
