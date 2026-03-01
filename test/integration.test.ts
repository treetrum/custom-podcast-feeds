import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runGenerate } from "../src/main";

describe("runGenerate integration", () => {
  test("generates one output feed and index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cpf-int-"));
    const configPath = join(dir, "feeds.yaml");
    const outDir = join(dir, "docs");

    await writeFile(
      configPath,
      [
        "defaults:",
        "  requestTimeoutMs: 1000",
        "  retries: 0",
        "sources:",
        "  - id: sourceA",
        "    url: https://example.com/a.xml",
        "  - id: sourceB",
        "    url: https://example.com/b.xml",
        "outputs:",
        "  - id: filtered",
        "    title: Filtered Feed",
        "    description: Filtered",
        "    link: https://example.com/filtered",
        "    sources: [sourceA, sourceB]",
        "    match:",
        "      mode: substring",
        "      includeAny: [ai, llm]",
        "      excludeAny: [rerun]",
      ].join("\n"),
      "utf8",
    );

    const sourceA = await readFile(join(process.cwd(), "test/fixtures/source-a.xml"), "utf8");
    const sourceB = await readFile(join(process.cwd(), "test/fixtures/source-b.xml"), "utf8");

    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("a.xml")) {
        return new Response(sourceA, { status: 200 });
      }
      if (url.includes("b.xml")) {
        return new Response(sourceB, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const result = await runGenerate({
      configPath,
      outDir,
      fetchImpl,
    });

    expect(result.writtenFiles.length).toBe(2);

    const xml = await readFile(join(outDir, "filtered.xml"), "utf8");
    expect(xml).toContain("LLM Interview with Researchers");
    expect(xml).toContain("AI News Weekly");
    expect(xml).not.toContain("AI News Weekly Rerun");
    expect(xml).toContain("<itunes:image href=\"https://example.com/a-art.jpg\"/>");
    expect(xml).toContain("<itunes:image href=\"https://example.com/a-ep-1.jpg\"/>");

    const indexJson = await readFile(join(outDir, "index.json"), "utf8");
    expect(indexJson).toContain("filtered");

    const secondResult = await runGenerate({
      configPath,
      outDir,
      fetchImpl,
    });
    expect(secondResult.writtenFiles).toHaveLength(0);
  });
});
