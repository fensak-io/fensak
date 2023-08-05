import { describe, expect, test } from '@jest/globals';

import { runRule } from './index.js';

describe('Interepreter runRule', () => {
  test('sanity check', () => {
    const ruleFn = `function main(inp) {
  return inp === "hello world";
}
`;
    const result = runRule(ruleFn, 'hello world');
    expect(result).toBe(true);
  });

  test('main return must be boolean', () => {
    const ruleFn = `function main(inp) {
  return inp + "world";
}
`;
    expect(() => runRule(ruleFn, 'hello ')).toThrow(
      'main function must return boolean',
    );
  });

  test('XMLHTTPRequest not supported', () => {
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

    expect(() => runRule(ruleFn, 'http://example.com/example.txt')).toThrow(
      'XMLHttpRequest is not defined',
    );
  });

  test('fetch is not supported', () => {
    const ruleFn = `function main(inp) {
  fetch(inp).then(function(response) {
    setOutput("false");
  });
  return true
}`;

    expect(() => runRule(ruleFn, 'http://example.com/example.txt')).toThrow(
      'fetch is not defined',
    );
  });
});
