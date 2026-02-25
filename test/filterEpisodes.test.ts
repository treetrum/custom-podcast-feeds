import { describe, expect, test } from "bun:test";
import { filterAndSortItems } from "../src/filterEpisodes";
import type { SourceItem } from "../src/types";

const items: SourceItem[] = [
  {
    sourceId: "a",
    title: "AI Intro",
    guid: "1",
    link: "https://e/1",
    pubDate: "Mon, 01 Jan 2024 12:00:00 GMT",
  },
  {
    sourceId: "a",
    title: "AI Intro Rerun",
    guid: "2",
    link: "https://e/2",
    pubDate: "Tue, 02 Jan 2024 12:00:00 GMT",
  },
  {
    sourceId: "b",
    title: "LLM Deep Dive",
    guid: "3",
    link: "https://e/3",
    pubDate: "Wed, 03 Jan 2024 12:00:00 GMT",
  },
  {
    sourceId: "b",
    title: "LLM Deep Dive",
    guid: "3",
    link: "https://e/3",
    pubDate: "Wed, 03 Jan 2024 12:00:00 GMT",
  },
];

describe("filterAndSortItems", () => {
  test("includes + excludes + dedupes + sorts", () => {
    const result = filterAndSortItems(
      items,
      {
        mode: "substring",
        caseSensitive: false,
        includeAny: ["ai", "llm"],
        excludeAny: ["rerun"],
      },
      10,
    );

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("LLM Deep Dive");
    expect(result[1].title).toBe("AI Intro");
  });

  test("supports regex mode", () => {
    const result = filterAndSortItems(
      items,
      {
        mode: "regex",
        includeAny: ["^AI"],
        excludeAny: [],
      },
      10,
    );

    expect(result).toHaveLength(2);
  });

  test("throws for invalid regex", () => {
    expect(() =>
      filterAndSortItems(
        items,
        {
          mode: "regex",
          includeAny: ["("],
        },
        10,
      ),
    ).toThrow();
  });
});
