import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from "../test_deps.ts";

import { PatchOp } from "../patch/mod.ts";
import { RuleLogLevel, RuleLogMode, runRule } from "./interpreter.ts";
import { compileRuleFn, RuleFnSourceLang } from "./compile.ts";

Deno.test("sanity check", async () => {
  const ruleFn = `function main(inp) {
  return inp.length === 1;
}
`;
  const result = await runRule(ruleFn, [{
    contentsID: "helloworld",
    path: "foo.txt",
    op: PatchOp.Insert,
    additions: 0,
    deletions: 0,
    diff: [],
  }]);
  assert(result.approve);
});

Deno.test("ES5 minify", async () => {
  const rawRuleFn = `function main(inp) {
  return inp.length === 1;
}
`;
  const ruleFn = compileRuleFn(rawRuleFn, RuleFnSourceLang.ES5);
  const result = await runRule(ruleFn, [{
    contentsID: "helloworld",
    path: "foo.txt",
    op: PatchOp.Insert,
    additions: 0,
    deletions: 0,
    diff: [],
  }]);
  assert(result.approve);
});

Deno.test("ES6 support", async () => {
  const rawRuleFn = `function main(inp) {
  const l = inp.length;
  return l === 1;
}
`;

  const ruleFn = compileRuleFn(rawRuleFn, RuleFnSourceLang.ES6);
  const result = await runRule(ruleFn, [{
    contentsID: "helloworld",
    path: "foo.txt",
    op: PatchOp.Insert,
    additions: 0,
    deletions: 0,
    diff: [],
  }]);
  assert(result.approve);
});

Deno.test("TS support", async () => {
  const rawRuleFn = `
// fensak remove-start
import type { IPatch } from "@fensak-io/fensak-patch-types";
// fensak remove-end

function main(inp: IPatch[]) {
  const l: number = inp.length;
  return l === 1;
}
`;

  const ruleFn = compileRuleFn(rawRuleFn, RuleFnSourceLang.Typescript);
  const result = await runRule(ruleFn, [{
    contentsID: "helloworld",
    path: "foo.txt",
    op: PatchOp.Insert,
    additions: 0,
    deletions: 0,
    diff: [],
  }]);
  assert(result.approve);
});

Deno.test("basic logging", async () => {
  const ruleFn = `function main(inp) {
  console.log("hello world");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], opts);
  assertFalse(result.approve);
  assertEquals(result.logs, [{
    level: RuleLogLevel.Info,
    msg: "hello world",
  }]);
});

Deno.test("logging with multiple objects", async () => {
  const ruleFn = `function main(inp) {
  console.log("hello", "world");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], opts);
  assertFalse(result.approve);
  assertEquals(result.logs, [{
    level: RuleLogLevel.Info,
    msg: "hello world",
  }]);
});

Deno.test("logging order", async () => {
  const ruleFn = `function main(inp) {
  console.log("hello");
  console.log("world");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], opts);
  assertFalse(result.approve);
  assertEquals(result.logs, [{
    level: RuleLogLevel.Info,
    msg: "hello",
  }, {
    level: RuleLogLevel.Info,
    msg: "world",
  }]);
});

Deno.test("logging warn level", async () => {
  const ruleFn = `function main(inp) {
  console.warn("hello");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], opts);
  assertFalse(result.approve);
  assertEquals(result.logs, [{
    level: RuleLogLevel.Warn,
    msg: "hello",
  }]);
});

Deno.test("logging error level", async () => {
  const ruleFn = `function main(inp) {
  console.error("hello");
  return inp.length === 1;
}
`;
  const opts = {
    logMode: RuleLogMode.Capture,
  };
  const result = await runRule(ruleFn, [], opts);
  assertFalse(result.approve);
  assertEquals(result.logs, [{
    level: RuleLogLevel.Error,
    msg: "hello",
  }]);
});

Deno.test("main return must be boolean", async () => {
  const ruleFn = `function main(inp) {
  return "hello world";
}
`;
  await assertRejects(
    () => runRule(ruleFn, []),
    Error,
    "main function must return boolean",
  );
});

Deno.test("infinite loop", async () => {
  const ruleFn = `function main(inp) {
  while (true) {}
  return "hello world";
}
`;
  await assertRejects(
    () => runRule(ruleFn, []),
    Error,
    "user defined rule timed out",
  );
});

Deno.test("XMLHTTPRequest not supported", async () => {
  const ruleFn = `function main(inp) {
  var req = new XMLHttpRequest();
  req.addEventListener("readystatechange", function() {
    if (req.readyState === 4 && req.status === 200) {
      setOutput("false");
    }
  });
  req.open("GET", inp[0].id);
  req.send();
  return true;
}`;

  await assertRejects(
    () =>
      runRule(ruleFn, [{
        contentsID: "http://example.com/example.txt",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      }]),
    Error,
    "XMLHttpRequest is not defined",
  );
});

Deno.test("fetch is not supported", async () => {
  const ruleFn = `function main(inp) {
  fetch(inp[0].id).then(function(response) {
    setOutput("false");
  });
  return true
}`;

  await assertRejects(
    () =>
      runRule(ruleFn, [{
        contentsID: "http://example.com/example.txt",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      }]),
    Error,
    "fetch is not defined",
  );
});

Deno.test("process is not supported", async () => {
  const ruleFn = `function main(inp) {
  console.log(process.env)
  return true
}`;

  await assertRejects(
    () =>
      runRule(ruleFn, [{
        contentsID: "helloworld",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      }]),
    Error,
    "process is not defined",
  );
});

Deno.test("Deno is not supported", async () => {
  const ruleFn = `function main(inp) {
  console.log(Deno.env)
  return true
}`;

  await assertRejects(
    () =>
      runRule(ruleFn, [{
        contentsID: "helloworld",
        path: "foo.txt",
        op: PatchOp.Insert,
        additions: 0,
        deletions: 0,
        diff: [],
      }]),
    Error,
    "Deno is not defined",
  );
});
