import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadConfig } from "./config";
import { fetchSourceFeeds } from "./fetchFeeds";
import { filterAndSortItems } from "./filterEpisodes";
import { renderRss } from "./renderRss";
import type { GenerateOptions, OutputConfig, SourceFeed, SourceItem } from "./types";

interface ParsedArgs {
  configPath: string;
  outDir: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let configPath = "config/feeds.yaml";
  let outDir = "docs";
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) {
      configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--outDir" && argv[i + 1]) {
      outDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--verbose") {
      verbose = true;
    }
  }

  return { configPath, outDir, verbose };
}

async function writeIfChanged(path: string, content: string): Promise<boolean> {
  let current: string | null = null;
  try {
    current = await readFile(path, "utf8");
  } catch {
    current = null;
  }

  if (current === content) {
    return false;
  }

  await writeFile(path, content, "utf8");
  return true;
}

function gatherItemsForOutput(output: OutputConfig, feeds: Map<string, { items: SourceItem[] }>): SourceItem[] {
  const combined: SourceItem[] = [];
  for (const sourceId of output.sources) {
    const sourceFeed = feeds.get(sourceId);
    if (!sourceFeed) {
      throw new Error(`Referenced source '${sourceId}' was not fetched`);
    }
    combined.push(...sourceFeed.items);
  }
  return combined;
}

function pickArtworkForOutput(output: OutputConfig, feeds: Map<string, SourceFeed>): string | undefined {
  for (const sourceId of output.sources) {
    const sourceFeed = feeds.get(sourceId);
    if (sourceFeed?.artworkUrl) {
      return sourceFeed.artworkUrl;
    }
  }
  return undefined;
}

export async function runGenerate(options: GenerateOptions = {}): Promise<{ writtenFiles: string[] }> {
  const configPath = options.configPath ?? "config/feeds.yaml";
  const outDir = options.outDir ?? "docs";
  const verbose = options.verbose ?? false;

  const config = await loadConfig(configPath);

  const timeoutMs = config.defaults?.requestTimeoutMs ?? 20_000;
  const retries = config.defaults?.retries ?? 2;
  const userAgent = config.defaults?.userAgent ?? "custom-podcast-feeds/0.1";

  const feeds = await fetchSourceFeeds(config, {
    fetchImpl: options.fetchImpl,
    timeoutMs,
    retries,
    userAgent,
    verbose,
  });

  await mkdir(outDir, { recursive: true });

  const writtenFiles: string[] = [];
  const indexOutputs: Array<{ id: string; title: string; description: string; path: string }> = [];

  for (const output of config.outputs) {
    const allItems = gatherItemsForOutput(output, feeds);
    const filteredItems = filterAndSortItems(allItems, output.match, output.limits?.maxItems ?? 200);
    const artworkUrl = pickArtworkForOutput(output, feeds);
    const xml = renderRss(output, filteredItems, new Date(), { artworkUrl });

    const xmlPath = join(outDir, `${output.id}.xml`);
    const changed = await writeIfChanged(xmlPath, xml);
    if (changed) {
      writtenFiles.push(xmlPath);
    }

    indexOutputs.push({
      id: output.id,
      title: output.title,
      description: output.description,
      path: `/${basename(xmlPath)}`,
    });

    if (verbose) {
      console.log(`Generated ${xmlPath} with ${filteredItems.length} item(s)`);
    }
  }

  const indexPayload = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      outputs: indexOutputs,
    },
    null,
    2,
  );

  const indexPath = join(outDir, "index.json");
  const indexChanged = await writeIfChanged(indexPath, `${indexPayload}\n`);
  if (indexChanged) {
    writtenFiles.push(indexPath);
  }

  return { writtenFiles };
}

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));

  runGenerate({
    configPath: args.configPath,
    outDir: args.outDir,
    verbose: args.verbose,
  })
    .then(({ writtenFiles }) => {
      console.log(`Generation complete. Updated ${writtenFiles.length} file(s).`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
