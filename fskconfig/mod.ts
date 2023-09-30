// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

/**
 * fskconfig
 * Contains the routines for parsing the Fensak Config. Supports loading from:
 * - `.fensak` repository in the GitHub Org.
 */
export * from "./parser.ts";
export { loadConfigFromGitHub } from "./loader_github.ts";
