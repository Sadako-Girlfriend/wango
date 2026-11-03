import { describe, expect, it } from "vitest";
import {
  collectTerms,
  matchLongest,
  reconcileHostLinks,
  snippetAround,
} from "./match";
import { createGlossaryNode } from "./tree";
import type { GlossaryLink } from "../types";

describe("matchLongest", () => {
  it("优先匹配最长词条", () => {
    const terms = [
      {
        entryId: "long",
        text: "饭饭店铺",
        blacklist: [] as string[],
      },
      {
        entryId: "short",
        text: "饭店",
        blacklist: [] as string[],
      },
    ];
    const hits = matchLongest("张三去了饭饭店铺。", terms);
    const active = hits.filter((h) => h.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].entryId).toBe("long");
    expect(active[0].matchedText).toBe("饭饭店铺");
  });

  it("黑名单语境拦截并占用区间", () => {
    const terms = [
      {
        entryId: "e1",
        text: "饭饭",
        blacklist: ["饭饭"],
      },
    ];
    const hits = matchLongest("今天吃了饭饭。", terms);
    expect(hits).toHaveLength(1);
    expect(hits[0].status).toBe("blocked");
  });

  it("别名可匹配", () => {
    const glossary = [
      createGlossaryNode({
        id: "g1",
        kind: "local",
        title: "餐厅",
        aliases: ["饭店"],
      }),
    ];
    const terms = collectTerms(glossary, []);
    const hits = matchLongest("张三去了饭店。", terms);
    expect(hits.some((h) => h.status === "active" && h.matchedText === "饭店")).toBe(
      true,
    );
  });
});

describe("reconcileHostLinks", () => {
  it("短词被长词挤掉记为 yielded", () => {
    const prev: GlossaryLink[] = [
      {
        id: "l1",
        entryId: "short",
        hostNodeId: "h1",
        start: 4,
        end: 6,
        matchedText: "饭店",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const hits = [
      {
        entryId: "long",
        start: 4,
        end: 8,
        matchedText: "饭饭店铺",
        status: "active" as const,
      },
    ];
    const host = "张三去了饭饭店铺。";
    const { links, logs } = reconcileHostLinks(
      prev,
      "h1",
      hits,
      new Set(["short", "long"]),
      host,
    );
    const short = links.find((l) => l.entryId === "short");
    expect(short?.status).toBe("yielded");
    expect(logs.some((l) => l.status === "yielded")).toBe(true);
    expect(links.some((l) => l.entryId === "long" && l.status === "active")).toBe(
      true,
    );
    const longLog = logs.find((l) => l.entryId === "long");
    expect(longLog?.before).toContain("饭饭店铺");
  });
});

describe("snippetAround", () => {
  it("抽出含匹配词的原句", () => {
    const text = "前句。张三去了饭店。后句。";
    const start = text.indexOf("饭店");
    expect(snippetAround(text, start, start + 2)).toBe("张三去了饭店。");
  });
});
