export type MatchMode = "substring" | "regex";

export interface ConfigDefaults {
  requestTimeoutMs?: number;
  retries?: number;
  userAgent?: string;
}

export interface SourceConfig {
  id: string;
  url: string;
  enabled?: boolean;
}

export interface MatchConfig {
  includeAny: string[];
  excludeAny?: string[];
  mode?: MatchMode;
  caseSensitive?: boolean;
}

export interface OutputLimits {
  maxItems?: number;
}

export interface OutputSort {
  by?: "pubDate";
  order?: "desc";
}

export interface OutputConfig {
  id: string;
  title: string;
  description: string;
  link: string;
  sources: string[];
  match: MatchConfig;
  limits?: OutputLimits;
  sort?: OutputSort;
}

export interface FeedConfig {
  defaults?: ConfigDefaults;
  sources: SourceConfig[];
  outputs: OutputConfig[];
}

export interface Enclosure {
  url: string;
  type?: string;
  length?: string;
}

export interface SourceItem {
  title?: string;
  description?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  enclosure?: Enclosure;
  itunes?: Record<string, string>;
  sourceId: string;
}

export interface SourceFeed {
  sourceId: string;
  sourceUrl: string;
  title?: string;
  description?: string;
  link?: string;
  items: SourceItem[];
}

export interface GenerateOptions {
  configPath?: string;
  outDir?: string;
  verbose?: boolean;
  fetchImpl?: typeof fetch;
}
