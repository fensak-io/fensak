import { assertEquals, assertThrows } from "../test_deps.ts";

import { PatchOp, runRule } from "./interpreter.ts";

Deno.test("sanity check", () => {
  const ruleFn = `function main(inp) {
  return inp.length === 1;
}
`;
  const result = runRule(ruleFn, [{
    path: "foo.txt",
    op: PatchOp.Insert,
    originalFull: "",
    updatedFull: "hello worlld",
    diff: [],
  }]);
  assertEquals(result, true);
});

Deno.test("main return must be boolean", () => {
  const ruleFn = `function main(inp) {
  return "hello world";
}
`;
  assertThrows(
    () => runRule(ruleFn, []),
    Error,
    "main function must return boolean",
  );
});

Deno.test("XMLHTTPRequest not supported", () => {
  const ruleFn = `function main(inp) {
  var req = new XMLHttpRequest();
  req.addEventListener("readystatechange", function() {
    if (req.readyState === 4 && req.status === 200) {
      setOutput("false");
    }
  });
  req.open("GET", inp[0].updatedFull);
  req.send();
  return true;
}`;

  assertThrows(
    () =>
      runRule(ruleFn, [{
        path: "foo.txt",
        op: PatchOp.Insert,
        originalFull: "",
        updatedFull: "http://example.com/example.txt",
        diff: [],
      }]),
    Error,
    "XMLHttpRequest is not defined",
  );
});

Deno.test("fetch is not supported", () => {
  const ruleFn = `function main(inp) {
  fetch(inp[0].updatedFull).then(function(response) {
    setOutput("false");
  });
  return true
}`;

  assertThrows(
    () =>
      runRule(ruleFn, [{
        path: "foo.txt",
        op: PatchOp.Insert,
        originalFull: "",
        updatedFull: "http://example.com/example.txt",
        diff: [],
      }]),
    Error,
    "fetch is not defined",
  );
});

Deno.test("process is not supported", () => {
  const ruleFn = `function main(inp) {
  console.log(process.env)
  return true
}`;

  assertThrows(
    () =>
      runRule(ruleFn, [{
        path: "foo.txt",
        op: PatchOp.Insert,
        originalFull: "",
        updatedFull: "hello worlld",
        diff: [],
      }]),
    Error,
    "process is not defined",
  );
});

Deno.test("Deno is not supported", () => {
  const ruleFn = `function main(inp) {
  console.log(Deno.env)
  return true
}`;

  assertThrows(
    () =>
      runRule(ruleFn, [{
        path: "foo.txt",
        op: PatchOp.Insert,
        originalFull: "",
        updatedFull: "hello worlld",
        diff: [],
      }]),
    Error,
    "Deno is not defined",
  );
});
