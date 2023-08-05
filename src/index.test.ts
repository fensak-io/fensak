import { describe, expect, test } from '@jest/globals';

import { add } from './index.js';

describe('Add', () => {
  test('with two numbers', () => {
    const r = add(2, 3);
    expect(r).toEqual(5);
  });
});
