# custom-podcast-feeds

Small Bun app that generates filtered podcast RSS feeds from source feeds.

Generated feeds are written to `docs/` and can be served by GitHub Pages.

## Quickstart

1. Install dependencies:

```bash
bun install
```

2. Edit `config/feeds.yaml` with your source feeds and output rules.
3. Generate feeds:

```bash
bun run generate
```

4. Generated feeds appear in `docs/` (for example, `docs/ai-episodes.xml`).

## Config overview

Config lives in `config/feeds.yaml`.

- `sources`: input podcast RSS URLs
- `outputs`: one generated RSS feed per output definition
- `outputs[].match.includeAny`: required include patterns
- `outputs[].match.excludeAny`: optional exclude patterns
- `outputs[].match.mode`: `substring` or `regex`

## GitHub Actions + Pages

The workflow `.github/workflows/regenerate-feeds.yml` runs every 6 hours, regenerates feeds, and commits changes to `main`.

To publish with GitHub Pages:

1. Repository settings -> Pages.
2. Source: `Deploy from a branch`.
3. Branch: `main` and folder `/docs`.

Your feed URL shape will be:

`https://<username>.github.io/<repo>/<output-id>.xml`

## Troubleshooting

- Invalid regex in config fails generation with a clear error.
- If a source feed cannot be fetched or parsed, the run fails by default to avoid stale or partial output.
