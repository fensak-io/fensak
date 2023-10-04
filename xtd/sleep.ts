// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}
