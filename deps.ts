import "https://raw.githubusercontent.com/NeilFraser/JS-Interpreter/10a8cf5e613834b5d36655c1921f818455fc324a/interpreter.js";
// NOTE:
// We use the yorinasub17 fork for acorn to support Deno. The upstream repo uses this instead of globalThis, which
// causes Deno to error.
// The commit hash is the head of the `deno` branch as of 2023-08-07.
import "https://raw.githubusercontent.com/yorinasub17/JS-Interpreter/4f6ec6c779e27cc2974e526007029586a374f49c/acorn.js";

declare global {
  // deno-lint-ignore no-explicit-any no-var
  var acorn: any;
  // deno-lint-ignore no-explicit-any no-var
  var Interpreter: any;
}

// Patch Interpreter nativeGlobal so that it doesn't rely on real globalThis.
const acorn = globalThis.acorn;
globalThis.acorn = undefined;
const Interpreter = globalThis.Interpreter;
globalThis.Interpreter = undefined;
Interpreter.nativeGlobal = {
  acorn: acorn,
  RegExp: RegExp,
  Date: Date,
  Number: Number,
  Boolean: Boolean,
  String: String,
};

// Export the patched interpreter
export { Interpreter };
