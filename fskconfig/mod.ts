/**
 * fskconfig
 * Contains the routines for parsing the Fensak Config. Supports loading from:
 * - `.fensak` repository in the GitHub Org.
 */
export * from "./parser.ts";
export { loadConfigFromGitHub } from "./loader_github.ts";
