import { Ajv, path, toml, yaml } from "../deps.ts";

import { RuleFnSourceLang } from "../udr/mod.ts";

import type { OrgConfig } from "./types.ts";

const __dirname = path.dirname(path.fromFileUrl(import.meta.url));
const cfgSchemaTxt = await Deno.readTextFile(
  path.join(__dirname, "./schema.json"),
);
const cfgSchema = JSON.parse(cfgSchemaTxt);

const ajv = new Ajv();
const validateOrgSchema = ajv.compile(cfgSchema);

/**
 * Parses the contents of an organization config file into a valid Fensak Org config. This function uses the json schema
 * definition in schema.json to determine if the configuration is well formed.
 *
 * @param filename The name of the config file. Used to determine the file type for parsing.
 * @param contents The string contents of the config file.
 * @returns The parsed Fensak Organization configuration specified in the provided contents.
 */
export function parseConfigFile(
  filename: string,
  contents: string,
): OrgConfig {
  const ext = path.extname(filename);
  // deno-lint-ignore no-explicit-any
  let data: any;
  switch (ext) {
    default:
      throw new Error(`unsupported config file type: ${ext}`);

    case ".json":
      data = JSON.parse(contents);
      break;

    case ".toml":
      data = toml.parse(contents);
      break;

    case ".yml":
    case ".yaml":
      data = yaml.parse(contents);
      break;
  }
  if (!validateOrgSchema(data)) {
    const errMsg = ajv.errorsText(validateOrgSchema.errors);
    throw new Error(
      `config file ${filename} does not match expected schema: ${errMsg}`,
    );
  }
  const typedData: OrgConfig = data as OrgConfig;

  // set the repoLang based on the filename extension if any entry is missing it.
  for (const repoName in typedData.repos) {
    const cfg = typedData.repos[repoName];
    if (!cfg.ruleLang) {
      typedData.repos[repoName].ruleLang = getRuleLang(cfg.ruleFile);
    }
  }

  return typedData;
}

export function getRuleLang(ruleFname: string): RuleFnSourceLang {
  const ext = path.extname(ruleFname);
  switch (ext) {
    default:
      throw new Error(`unsupported rule file type: ${ext}`);

    case ".ts":
      return RuleFnSourceLang.Typescript;
    case ".js":
      return RuleFnSourceLang.ES6;
  }
}
