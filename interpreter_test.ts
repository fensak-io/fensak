import { assertEquals, assertThrows } from "./test_deps.ts";

import { runRule } from "./interpreter.ts";

Deno.test("sanity check", () => {
  const ruleFn = `function main(inp) {
  return inp === "hello world";
}
`;
  const result = runRule(ruleFn, "hello world");
  assertEquals(result, true);
});

Deno.test("main return must be boolean", () => {
  const ruleFn = `function main(inp) {
  return inp + "world";
}
`;
  assertThrows(
    () => runRule(ruleFn, "hello "),
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
  req.open("GET", inp);
  req.send();
  return true;
}`;

  assertThrows(
    () => runRule(ruleFn, "http://example.com/example.txt"),
    Error,
    "XMLHttpRequest is not defined",
  );
});

Deno.test("fetch is not supported", () => {
  const ruleFn = `function main(inp) {
  fetch(inp).then(function(response) {
    setOutput("false");
  });
  return true
}`;

  assertThrows(
    () => runRule(ruleFn, "http://example.com/example.txt"),
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
    () => runRule(ruleFn, "http://example.com/example.txt"),
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
    () => runRule(ruleFn, "http://example.com/example.txt"),
    Error,
    "Deno is not defined",
  );
});
