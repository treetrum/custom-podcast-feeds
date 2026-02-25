import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import type { FeedConfig, MatchMode, OutputConfig, SourceConfig } from "./types";

class ConfigError extends Error {
  constructor(messages: string[]) {
    super(`Invalid config:\n${messages.map((m) => `- ${m}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((v) => typeof v === "string" && v.length > 0)) {
    return null;
  }
  return value;
}

function normalizeSource(raw: unknown, index: number, errors: string[]): SourceConfig | null {
  if (!isObject(raw)) {
    errors.push(`sources[${index}] must be an object`);
    return null;
  }

  const id = raw.id;
  const url = raw.url;
  const enabled = raw.enabled;

  if (typeof id !== "string" || id.length === 0) {
    errors.push(`sources[${index}].id must be a non-empty string`);
  }

  if (typeof url !== "string" || url.length === 0) {
    errors.push(`sources[${index}].url must be a non-empty string`);
  }

  if (enabled !== undefined && typeof enabled !== "boolean") {
    errors.push(`sources[${index}].enabled must be a boolean when provided`);
  }

  if (errors.length > 0 && (typeof id !== "string" || typeof url !== "string")) {
    return null;
  }

  return {
    id: id as string,
    url: url as string,
    enabled: enabled as boolean | undefined,
  };
}

function normalizeOutput(raw: unknown, index: number, errors: string[]): OutputConfig | null {
  if (!isObject(raw)) {
    errors.push(`outputs[${index}] must be an object`);
    return null;
  }

  const id = raw.id;
  const title = raw.title;
  const description = raw.description;
  const link = raw.link;
  const sources = asStringArray(raw.sources);

  if (typeof id !== "string" || id.length === 0) {
    errors.push(`outputs[${index}].id must be a non-empty string`);
  }
  if (typeof title !== "string" || title.length === 0) {
    errors.push(`outputs[${index}].title must be a non-empty string`);
  }
  if (typeof description !== "string" || description.length === 0) {
    errors.push(`outputs[${index}].description must be a non-empty string`);
  }
  if (typeof link !== "string" || link.length === 0) {
    errors.push(`outputs[${index}].link must be a non-empty string`);
  }
  if (!sources || sources.length === 0) {
    errors.push(`outputs[${index}].sources must be a non-empty string array`);
  }

  if (!isObject(raw.match)) {
    errors.push(`outputs[${index}].match must be an object`);
    return null;
  }

  const includeAny = asStringArray(raw.match.includeAny);
  const excludeAny = raw.match.excludeAny === undefined ? [] : asStringArray(raw.match.excludeAny);
  const mode = raw.match.mode ?? "substring";
  const caseSensitive = raw.match.caseSensitive ?? false;

  if (!includeAny || includeAny.length === 0) {
    errors.push(`outputs[${index}].match.includeAny must be a non-empty string array`);
  }
  if (excludeAny === null) {
    errors.push(`outputs[${index}].match.excludeAny must be a string array`);
  }
  if (mode !== "substring" && mode !== "regex") {
    errors.push(`outputs[${index}].match.mode must be 'substring' or 'regex'`);
  }
  if (typeof caseSensitive !== "boolean") {
    errors.push(`outputs[${index}].match.caseSensitive must be a boolean`);
  }

  const maxItems = isObject(raw.limits) ? raw.limits.maxItems : undefined;
  if (maxItems !== undefined && (!Number.isInteger(maxItems) || (maxItems as number) <= 0)) {
    errors.push(`outputs[${index}].limits.maxItems must be a positive integer`);
  }

  if (typeof id !== "string" || !sources || !includeAny || excludeAny === null) {
    return null;
  }

  return {
    id,
    title: title as string,
    description: description as string,
    link: link as string,
    sources,
    match: {
      includeAny,
      excludeAny,
      mode: mode as MatchMode,
      caseSensitive,
    },
    limits: maxItems === undefined ? undefined : { maxItems: maxItems as number },
    sort: { by: "pubDate", order: "desc" },
  };
}

export async function loadConfig(configPath: string): Promise<FeedConfig> {
  const rawText = await readFile(configPath, "utf8");
  const parsed = parse(rawText);

  if (!isObject(parsed)) {
    throw new ConfigError(["root must be an object"]);
  }

  const errors: string[] = [];
  const sourcesRaw = parsed.sources;
  const outputsRaw = parsed.outputs;

  if (!Array.isArray(sourcesRaw) || sourcesRaw.length === 0) {
    errors.push("sources must be a non-empty array");
  }
  if (!Array.isArray(outputsRaw) || outputsRaw.length === 0) {
    errors.push("outputs must be a non-empty array");
  }

  const sources: SourceConfig[] = Array.isArray(sourcesRaw)
    ? sourcesRaw
        .map((source, idx) => normalizeSource(source, idx, errors))
        .filter((s): s is SourceConfig => s !== null)
    : [];

  const outputs: OutputConfig[] = Array.isArray(outputsRaw)
    ? outputsRaw
        .map((output, idx) => normalizeOutput(output, idx, errors))
        .filter((o): o is OutputConfig => o !== null)
    : [];

  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) {
      errors.push(`duplicate source id: ${source.id}`);
    }
    sourceIds.add(source.id);
  }

  const outputIds = new Set<string>();
  for (const output of outputs) {
    if (outputIds.has(output.id)) {
      errors.push(`duplicate output id: ${output.id}`);
    }
    outputIds.add(output.id);

    for (const sourceId of output.sources) {
      if (!sourceIds.has(sourceId)) {
        errors.push(`output '${output.id}' references unknown source '${sourceId}'`);
      }
    }
  }

  const defaults = isObject(parsed.defaults) ? parsed.defaults : {};

  if (defaults.requestTimeoutMs !== undefined && (!Number.isInteger(defaults.requestTimeoutMs) || defaults.requestTimeoutMs <= 0)) {
    errors.push("defaults.requestTimeoutMs must be a positive integer when provided");
  }
  if (defaults.retries !== undefined && (!Number.isInteger(defaults.retries) || defaults.retries < 0)) {
    errors.push("defaults.retries must be a non-negative integer when provided");
  }
  if (defaults.userAgent !== undefined && typeof defaults.userAgent !== "string") {
    errors.push("defaults.userAgent must be a string when provided");
  }

  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  return {
    defaults: {
      requestTimeoutMs: defaults.requestTimeoutMs as number | undefined,
      retries: defaults.retries as number | undefined,
      userAgent: defaults.userAgent as string | undefined,
    },
    sources,
    outputs,
  };
}

export { ConfigError };
