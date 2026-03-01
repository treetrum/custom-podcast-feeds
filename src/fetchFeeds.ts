import { XMLParser } from "fast-xml-parser";
import type { FeedConfig, SourceFeed, SourceItem, SourceConfig } from "./types";

interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs: number;
  retries: number;
  userAgent: string;
  verbose?: boolean;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function readNodeText(node: unknown): string | undefined {
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "number") {
    return String(node);
  }
  if (!node || typeof node !== "object") {
    return undefined;
  }

  const record = node as Record<string, unknown>;
  if (typeof record["#text"] === "string") {
    return record["#text"];
  }
  return undefined;
}

function readNodeAttribute(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const value = (node as Record<string, unknown>)[`@_${name}`];
  return typeof value === "string" ? value : undefined;
}

function pickItemArtwork(raw: Record<string, unknown>): string | undefined {
  const itunesImageHref = readNodeAttribute(raw["itunes:image"], "href");
  if (itunesImageHref) {
    return itunesImageHref;
  }

  const mediaThumbnails = asArray(raw["media:thumbnail"]);
  for (const thumbnail of mediaThumbnails) {
    const thumbnailUrl = readNodeAttribute(thumbnail, "url");
    if (thumbnailUrl) {
      return thumbnailUrl;
    }
  }

  const mediaContents = asArray(raw["media:content"]);
  for (const contentNode of mediaContents) {
    const contentUrl = readNodeAttribute(contentNode, "url");
    if (!contentUrl) {
      continue;
    }

    const medium = readNodeAttribute(contentNode, "medium");
    const type = readNodeAttribute(contentNode, "type");
    if (medium?.toLowerCase() === "image" || type?.toLowerCase().startsWith("image/")) {
      return contentUrl;
    }
  }

  const imageNode = raw.image as Record<string, unknown> | undefined;
  return imageNode ? readNodeText(imageNode.url) : undefined;
}

function normalizeItem(sourceId: string, raw: Record<string, unknown>): SourceItem {
  const enclosureRaw = raw.enclosure;
  let enclosure: SourceItem["enclosure"];

  if (enclosureRaw && typeof enclosureRaw === "object") {
    const e = enclosureRaw as Record<string, unknown>;
    if (typeof e["@_url"] === "string") {
      enclosure = {
        url: e["@_url"],
        type: typeof e["@_type"] === "string" ? e["@_type"] : undefined,
        length: typeof e["@_length"] === "string" ? e["@_length"] : undefined,
      };
    }
  }

  const itunes: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith("itunes:") || key === "itunes:image") {
      continue;
    }
    const text = readNodeText(value);
    if (text) {
      itunes[key] = text;
    }
  }

  return {
    sourceId,
    title: readNodeText(raw.title),
    description: readNodeText(raw.description) ?? readNodeText(raw["content:encoded"]),
    link: readNodeText(raw.link),
    guid: readNodeText(raw.guid),
    pubDate:
      readNodeText(raw.pubDate) ??
      readNodeText(raw.published) ??
      readNodeText(raw.updated) ??
      readNodeText(raw["dc:date"]),
    artworkUrl: pickItemArtwork(raw),
    enclosure,
    itunes: Object.keys(itunes).length > 0 ? itunes : undefined,
  };
}

function normalizeRss(source: SourceConfig, xml: string): SourceFeed {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;

  if (!channel || typeof channel !== "object") {
    throw new Error(`Feed ${source.id} did not contain RSS channel data`);
  }

  const rawItems = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const items = rawItems.map((item) => normalizeItem(source.id, item));
  const imageNode = channel.image as Record<string, unknown> | undefined;
  const itunesImageNode = channel["itunes:image"] as Record<string, unknown> | undefined;
  const artworkUrl =
    (itunesImageNode && typeof itunesImageNode["@_href"] === "string" ? itunesImageNode["@_href"] : undefined) ??
    (imageNode ? readNodeText(imageNode.url) : undefined);

  return {
    sourceId: source.id,
    sourceUrl: source.url,
    title: readNodeText(channel.title),
    description: readNodeText(channel.description),
    link: readNodeText(channel.link),
    artworkUrl,
    items,
  };
}

async function fetchWithRetry(url: string, opts: FetchOptions): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": opts.userAgent,
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < opts.retries) {
        await Bun.sleep(300 * (attempt + 1));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Failed to fetch ${url}: ${String(lastError)}`);
}

async function runWithConcurrency<T>(items: T[], limit: number, runner: (item: T) => Promise<void>): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      await runner(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export async function fetchSourceFeeds(config: FeedConfig, options: FetchOptions): Promise<Map<string, SourceFeed>> {
  const enabledSources = config.sources.filter((source) => source.enabled !== false);
  const results = new Map<string, SourceFeed>();

  await runWithConcurrency(enabledSources, 5, async (source) => {
    if (options.verbose) {
      console.log(`Fetching ${source.id} (${source.url})`);
    }

    const xml = await fetchWithRetry(source.url, options);
    const normalized = normalizeRss(source, xml);
    results.set(source.id, normalized);
  });

  return results;
}
