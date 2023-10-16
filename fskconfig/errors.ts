// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

/**
 * Thrown when there is an error while ingesting a Fensak Config that should be surfaced to the user. These errors will
 * show up as a check on the commit.
 */
export class FensakConfigLoaderUserError extends Error {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, FensakConfigLoaderUserError.prototype);
  }
}
