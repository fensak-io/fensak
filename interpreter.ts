import { Interpreter } from "./deps.ts";

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

// TODO: add support for es6 with babel
// TODO: add support for typescript with babel
// TODO: define patch type
// deno-lint-ignore no-explicit-any
export function runRule(ruleFn: string, patch: any): boolean {
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
      setupConsole(interpreter, scope);

      interpreter.setProperty(
        scope,
        "getInput",
        interpreter.createNativeFunction((): string => {
          return JSON.stringify(patch);
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
