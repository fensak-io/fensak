import { Interpreter } from "../deps.ts";

/**
 * The operation on a line in a hunk of a patch.
 * @property Unknown Unknown operation.
 * @property Insert The line was inserted in this hunk.
 * @property Delete The line was deleted in this hunk .
 * @property Modified The line was modified in this hunk.
 * @property Untouched The line was not touched in this hunk. This is usually provided to provide context.
 */
export enum LineOp {
  Unknown = "unknown",
  Insert = "insert",
  Delete = "delete",
  Modified = "modified",
  Untouched = "untouched",
}

/**
 * Represents updates to a single line in a hunk.
 * @property pos The position of the line in the source file.
 * @property op The operation that was done to the line in the hunk.
 * @property text The text context for the operation. For insert operations, this is the line to insert; for delete
 *                operations, this is the line to delete; for modifications this is the resulting text.
 */
export interface ILineDiff {
  pos: number;
  op: LineOp;
  text: string;
}

/**
 * Represents updates to a section of the file in a patch.
 * @property originalStart The starting line in the original file (before the change) where the hunk applies.
 * @property originalLength The number of lines after the start in the original file where the hunk applies.
 * @property updatedStart The starting line in the updated file (before the change) where the hunk applies.
 * @property updatedLength The number of lines after the start in the updated file where the hunk applies.
 * @property diffOperations The list of modifications to apply to the source file in the range to get the updated file.
 */
export interface IHunk {
  originalStart: number;
  originalLength: number;
  updatedStart: number;
  updatedLength: number;
  diffOperations: ILineDiff[];
}

/**
 * The operation on the file in the patch.
 * @property Unknown Unknown operation.
 * @property Insert The file was inserted in this patch.
 * @property Delete The file was deleted in this patch.
 * @property Modified The file was modified in this patch.
 */
export enum PatchOp {
  Unknown = "unknown",
  Insert = "insert",
  Delete = "delete",
  Modified = "modified",
}

/**
 * Represents updates to a single file that was done in the change set.
 * @property path The relative path (from the root of the repo) to the file that was updated in the patch.
 * @property op The operation that was done on the file in the patch.
 * @property originalFull The full contents of the original file (before the change). This is empty if the operation is
 *                        Insert.
 * @property updatedFull The full contents of the updated file (after the change). This is empty if the operation is
 *                       Delete.
 * @property diff The list of diffs, organized into hunks.
 */
export interface IPatch {
  path: string;
  op: PatchOp;
  originalFull: string;
  updatedFull: string;
  diff: IHunk[];
}

// deno-lint-ignore no-explicit-any
function setupConsole(interpreter: any, scope: any) {
  const nativeConsole = interpreter.createObjectProto(interpreter.OBJECT_PROTO);

  const nativeLogFunc = interpreter.createNativeFunction(console.log);
  interpreter.setProperty(nativeConsole, "log", nativeLogFunc);
  const nativeErrorFunc = interpreter.createNativeFunction(console.error);
  interpreter.setProperty(nativeConsole, "error", nativeErrorFunc);
  const nativeInfoFunc = interpreter.createNativeFunction(console.info);
  interpreter.setProperty(nativeConsole, "info", nativeInfoFunc);
  const nativeDebugFunc = interpreter.createNativeFunction(console.debug);
  interpreter.setProperty(nativeConsole, "debug", nativeDebugFunc);

  interpreter.setProperty(scope, "console", nativeConsole);
  interpreter.setProperty(scope, "log", nativeLogFunc);
}

/**
 * Execute the given user defined rule function in JavaScript (EcmaScript 5) against the given patch object.
 *
 * TODO: add support for es6 with babel
 * TODO: add support for typescript with babel
 *
 * @param ruleFn A string containing the definition of a main function that takes in the patch object and returns a bool
 *               indicating if the patch passes the rule (and thus should allow auto-merge).
 * @param patch A list of patch objects to evaluate the rule against.
 * @returns A boolean indicating whether the given patch passes the user defined rule.
 */
export function runRule(
  ruleFn: string,
  patchList: IPatch[],
): boolean {
  const code = `${ruleFn}
var inp = JSON.parse(getInput());
var out = main(inp);
if (typeof out !== "boolean") {
  throw new Error("main function must return boolean (returned " + out + ")");
}
setOutput(JSON.stringify(out));
`;

  let output = false;
  const interpreter = new Interpreter(
    code,
    // deno-lint-ignore no-explicit-any
    (interpreter: any, scope: any) => {
      // Setup the console object so that the user functions can emit debug logs for introspection.
      setupConsole(interpreter, scope);

      // Setup getInput and getOutput inline so that they can access the patch object and output variable to message
      // pass between the main thread and the interpreter.
      interpreter.setProperty(
        scope,
        "getInput",
        interpreter.createNativeFunction((): string => {
          return JSON.stringify(patchList);
        }),
      );
      interpreter.setProperty(
        scope,
        "setOutput",
        interpreter.createNativeFunction((jsonOut: string) => {
          output = JSON.parse(jsonOut);
        }),
      );
    },
  );
  interpreter.run();
  return output;
}
