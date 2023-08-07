import { Interpreter } from "../deps.ts";
import { IPatch } from "../patch/mod.ts";

// Max time in milliseconds for the user defined rule to run. Any UDR functions that take longer than this will throw an error.
const maxUDRRuntime = 5000;
// Sleep every 100 steps to yield to other tasks.
const maxStepIterationsBeforeSleep = 100;
const sleepBetweenStepIterations = 100;

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
): Promise<boolean> {
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
  const outputPromise = new Promise<boolean>((resolve, reject) => {
    (async () => {
      let rejected = false;
      let sleeping: number | null = null;
      const tout = setTimeout(() => {
        if (sleeping) {
          clearTimeout(sleeping);
        }
        rejected = true;
        reject(new Error("user defined rule timed out"));
      }, maxUDRRuntime);

      let iterations = 0;
      try {
        while (interpreter.step()) {
          if (rejected) {
            return;
          }
          iterations++;
          // Every max step iterations, sleep to yield to other threads and then reset the counter
          if (iterations > maxStepIterationsBeforeSleep) {
            await new Promise((resolve) =>
              sleeping = setTimeout(resolve, sleepBetweenStepIterations)
            );
            iterations = 0;
          }
        }
        resolve(output);
      } catch (e) {
        reject(e);
      } finally {
        clearTimeout(tout);
      }
    })();
  });
  return outputPromise;
}
