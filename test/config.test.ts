import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  test("loads valid config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cpf-config-"));
    const configPath = join(dir, "feeds.yaml");

    await writeFile(
      configPath,
      `sources:\n  - id: one\n    url: https://example.com/rss\noutputs:\n  - id: out\n    title: Out\n    description: Test\n    link: https://example.com\n    sources: [one]\n    match:\n      includeAny: [ai]\n`,
      "utf8",
    );

    const config = await loadConfig(configPath);
    expect(config.sources).toHaveLength(1);
    expect(config.outputs).toHaveLength(1);
    expect(config.outputs[0].match.mode).toBe("substring");
  });

  test("rejects unknown source references", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cpf-config-"));
    const configPath = join(dir, "feeds.yaml");

    await writeFile(
      configPath,
      `sources:\n  - id: one\n    url: https://example.com/rss\noutputs:\n  - id: out\n    title: Out\n    description: Test\n    link: https://example.com\n    sources: [two]\n    match:\n      includeAny: [ai]\n`,
      "utf8",
    );

    await expect(loadConfig(configPath)).rejects.toThrow("unknown source");
  });
});
