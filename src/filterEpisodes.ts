import type { MatchConfig, SourceItem } from "./types";

function buildMatchers(match: MatchConfig): { include: RegExp[]; exclude: RegExp[] } {
  const mode = match.mode ?? "substring";
  const caseSensitive = match.caseSensitive ?? false;

  const regexFlags = caseSensitive ? "" : "i";

  if (mode === "regex") {
    return {
      include: match.includeAny.map((pattern) => new RegExp(pattern, regexFlags)),
      exclude: (match.excludeAny ?? []).map((pattern) => new RegExp(pattern, regexFlags)),
    };
  }

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    include: match.includeAny.map((pattern) => new RegExp(escapeRegex(pattern), regexFlags)),
    exclude: (match.excludeAny ?? []).map((pattern) => new RegExp(escapeRegex(pattern), regexFlags)),
  };
}

function makeKey(item: SourceItem): string | null {
  if (item.guid && item.guid.length > 0) {
    return `guid:${item.guid}`;
  }
  if (item.link && item.link.length > 0) {
    return `link:${item.link}`;
  }
  if (item.title && item.pubDate) {
    return `title-date:${item.title}::${item.pubDate}`;
  }
  return null;
}

export function filterAndSortItems(items: SourceItem[], match: MatchConfig, maxItems = 200): SourceItem[] {
  const { include, exclude } = buildMatchers(match);

  const filtered = items.filter((item) => {
    if (!item.title || item.title.trim().length === 0) {
      return false;
    }

    const isIncluded = include.some((regex) => regex.test(item.title!));
    if (!isIncluded) {
      return false;
    }

    const isExcluded = exclude.some((regex) => regex.test(item.title!));
    return !isExcluded;
  });

  const deduped: SourceItem[] = [];
  const seen = new Set<string>();

  for (const item of filtered) {
    const key = makeKey(item);
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    const aMs = a.pubDate ? Date.parse(a.pubDate) : NaN;
    const bMs = b.pubDate ? Date.parse(b.pubDate) : NaN;

    const aValid = Number.isFinite(aMs);
    const bValid = Number.isFinite(bMs);

    if (aValid && bValid) {
      return bMs - aMs;
    }
    if (aValid) {
      return -1;
    }
    if (bValid) {
      return 1;
    }
    return 0;
  });

  return deduped.slice(0, maxItems);
}
