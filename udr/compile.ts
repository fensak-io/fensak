import { babel, babelPresetEnv, babelPresetTypescript } from "../deps.ts";

/**
 * The source language of the rule function. Determines compiler settings to ensure it can be compiled down to ES5.
 * @property ES5 The source is using ecmascript 5.
 * @property ES6 The source is using ecmascript 6.
 * @property Typescript The source is using Typescript.
 */
export enum RuleFnSourceLang {
  ES5 = "es5",
  ES6 = "es6",
  Typescript = "ts",
}

/**
 * Compiles the given rule function using Babel. The rule function can be provided as ES6.
 *
 * TODO: add support for typescript
 *
 * @param ruleFn A string containing the definition of a main function in ES6.
 * @param srcType What language the source is written in. If omitted, defaults to ES5.
 * @returns A string containing the ES5 version of the provided main function.
 */
export function compileRuleFn(
  ruleFn: string,
  srcLang?: RuleFnSourceLang,
): string {
  if (!srcLang || srcLang == RuleFnSourceLang.ES5) {
    return ruleFn;
  }

  if (srcLang == RuleFnSourceLang.Typescript) {
    // For typescript, we need two passes: once to compile TS to ES6, then ES6 to ES5.
    // So here, we just take care of compiling to ES6.
    ruleFn = babel.transform(ruleFn, {
      presets: [babelPresetTypescript],
      filename: "rule.ts",
    }).code;
  }

  // ruleFn is assumed to be in ES6 at this point.
  return babel.transform(ruleFn, { presets: [babelPresetEnv] }).code;
}
