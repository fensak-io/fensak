import { assertEquals, assertRejects } from "../test_deps.ts";

import { PatchOp } from "../patch/mod.ts";
import { runRule } from "./interpreter.ts";

Deno.test("sanity check", async () => {
  const ruleFn = `function main(inp) {
  return inp.length === 1;
}
`;
  const result = await runRule(ruleFn, [{
    contentsID: "helloworld",
    path: "foo.txt",
    op: PatchOp.Insert,
    diff: [],
  }]);
  assertEquals(result, true);
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
        diff: [],
      }]),
    Error,
    "Deno is not defined",
  );
});
