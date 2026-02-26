import type { OutputConfig, SourceItem } from "./types";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderItem(item: SourceItem): string {
  const fields: string[] = [];

  fields.push(`<title>${xmlEscape(item.title ?? "Untitled Episode")}</title>`);

  if (item.description) {
    fields.push(`<description>${xmlEscape(item.description)}</description>`);
  }
  if (item.link) {
    fields.push(`<link>${xmlEscape(item.link)}</link>`);
  }

  const guid = item.guid ?? item.link ?? `${item.title ?? "item"}-${item.pubDate ?? "unknown"}`;
  fields.push(`<guid isPermaLink="false">${xmlEscape(guid)}</guid>`);

  if (item.pubDate) {
    const parsed = Date.parse(item.pubDate);
    const pubDate = Number.isFinite(parsed) ? new Date(parsed).toUTCString() : item.pubDate;
    fields.push(`<pubDate>${xmlEscape(pubDate)}</pubDate>`);
  }

  if (item.enclosure?.url) {
    const length = item.enclosure.length ?? "0";
    const type = item.enclosure.type ?? "audio/mpeg";
    fields.push(
      `<enclosure url="${xmlEscape(item.enclosure.url)}" length="${xmlEscape(length)}" type="${xmlEscape(type)}"/>`,
    );
  }

  if (item.itunes) {
    for (const [key, value] of Object.entries(item.itunes)) {
      fields.push(`<${key}>${xmlEscape(value)}</${key}>`);
    }
  }

  return `<item>${fields.join("")}</item>`;
}

interface RenderOptions {
  artworkUrl?: string;
}

export function renderRss(
  output: OutputConfig,
  items: SourceItem[],
  generatedAt?: Date,
  options: RenderOptions = {},
): string {
  const channelFields: string[] = [
    `<title>${xmlEscape(output.title)}</title>`,
    `<description>${xmlEscape(output.description)}</description>`,
    `<link>${xmlEscape(output.link)}</link>`,
  ];
  if (generatedAt) {
    channelFields.push(`<lastBuildDate>${generatedAt.toUTCString()}</lastBuildDate>`);
  }

  if (options.artworkUrl) {
    const escapedArtworkUrl = xmlEscape(options.artworkUrl);
    channelFields.push(`<itunes:image href="${escapedArtworkUrl}"/>`);
    channelFields.push(
      `<image><url>${escapedArtworkUrl}</url><title>${xmlEscape(output.title)}</title><link>${xmlEscape(output.link)}</link></image>`,
    );
  }

  const body = items.map((item) => renderItem(item)).join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">`,
    `<channel>${channelFields.join("")}${body}</channel>`,
    `</rss>`,
  ].join("");
}
