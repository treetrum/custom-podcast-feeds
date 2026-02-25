import { describe, expect, test } from "bun:test";
import { renderRss } from "../src/renderRss";

describe("renderRss", () => {
  test("renders channel and item tags", () => {
    const xml = renderRss(
      {
        id: "out",
        title: "My Feed",
        description: "Desc",
        link: "https://example.com",
        sources: ["one"],
        match: { includeAny: ["ai"] },
      },
      [
        {
          sourceId: "one",
          title: "AI Episode",
          description: "Episode <content>",
          link: "https://example.com/ep",
          guid: "guid-1",
          pubDate: "Mon, 01 Jan 2024 12:00:00 GMT",
          enclosure: {
            url: "https://example.com/audio.mp3",
            length: "10",
            type: "audio/mpeg",
          },
          itunes: {
            "itunes:duration": "3600",
          },
        },
      ],
      new Date("2024-01-10T00:00:00Z"),
    );

    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("<title>My Feed</title>");
    expect(xml).toContain("<item>");
    expect(xml).toContain("Episode &lt;content&gt;");
    expect(xml).toContain("itunes:duration");
  });
});
