import { describe, expect, it } from "vitest";
import {
  enforceSingleCallout,
  InspireEventParser,
  parseInspireEventLine,
  projectJsonToEvents,
  safePartialMarkdown,
} from "./inspireProtocol";

describe("parseInspireEventLine", () => {
  it("parses project / node / delta / done / error", () => {
    expect(parseInspireEventLine('{"type":"project","name":"Demo"}')).toEqual({
      type: "project",
      name: "Demo",
    });
    expect(
      parseInspireEventLine(
        '{"type":"node","id":"n1","parentId":null,"title":"根"}',
      ),
    ).toEqual({
      type: "node",
      id: "n1",
      parentId: null,
      title: "根",
    });
    expect(
      parseInspireEventLine('{"type":"delta","id":"n1","text":"你好"}'),
    ).toEqual({
      type: "delta",
      id: "n1",
      text: "你好",
    });
    expect(parseInspireEventLine('{"type":"done"}')).toEqual({ type: "done" });
    expect(
      parseInspireEventLine('{"type":"error","message":"boom"}'),
    ).toEqual({ type: "error", message: "boom" });
  });

  it("tolerates data: prefix and skips junk", () => {
    expect(
      parseInspireEventLine('data: {"type":"done"}'),
    ).toEqual({ type: "done" });
    expect(parseInspireEventLine("")).toBeNull();
    expect(parseInspireEventLine("not json")).toBeNull();
    expect(parseInspireEventLine('{"type":"nope"}')).toBeNull();
  });

  it("normalizes empty parentId and blank title", () => {
    expect(
      parseInspireEventLine(
        '{"type":"node","id":"a","parentId":"","title":"  "}',
      ),
    ).toEqual({
      type: "node",
      id: "a",
      parentId: null,
      title: "未命名",
    });
  });

  it("keeps optional priority on node", () => {
    expect(
      parseInspireEventLine(
        '{"type":"node","id":"n1","parentId":null,"title":"核心","priority":"high"}',
      ),
    ).toEqual({
      type: "node",
      id: "n1",
      parentId: null,
      title: "核心",
      priority: "high",
    });
    expect(
      parseInspireEventLine(
        '{"type":"node","id":"n2","parentId":null,"title":"杂","priority":"nope"}',
      ),
    ).toBeNull();
  });
});

describe("InspireEventParser", () => {
  it("splits across chunk boundaries", () => {
    const p = new InspireEventParser();
    expect(p.push('{"type":"pro')).toEqual([]);
    expect(p.push('ject","name":"X"}\n{"type":"node","id":"n1","parentId":null,"title":"A"}\n')).toEqual([
      { type: "project", name: "X" },
      { type: "node", id: "n1", parentId: null, title: "A" },
    ]);
    expect(p.push('{"type":"delta","id":"n1","text":"hi"}\n')).toEqual([
      { type: "delta", id: "n1", text: "hi" },
    ]);
    expect(p.push('{"type":"done"}\n')).toEqual([{ type: "done" }]);
    expect(p.done).toBe(true);
    expect(p.push('{"type":"delta","id":"n1","text":"x"}\n')).toEqual([]);
  });

  it("flush synthesizes done when stream ends mid-content", () => {
    const p = new InspireEventParser();
    p.push('{"type":"node","id":"n1","parentId":null,"title":"A"}\n');
    expect(p.flush()).toEqual([{ type: "done" }]);
    expect(p.done).toBe(true);
  });

  it("flush parses trailing line without newline", () => {
    const p = new InspireEventParser();
    p.push('{"type":"done"}');
    expect(p.flush()).toEqual([{ type: "done" }]);
  });
});

describe("safePartialMarkdown", () => {
  it("streams unclosed fence with synthetic close", () => {
    const { visible, held } = safePartialMarkdown("intro\n```ts\nconst x");
    expect(held).toBe("");
    expect(visible.startsWith("intro\n```ts\nconst x")).toBe(true);
    expect(visible.trimEnd().endsWith("```")).toBe(true);
  });

  it("streams unclosed callout with synthetic close", () => {
    const { visible, held } = safePartialMarkdown(
      'hi\n<aside data-type="callout"><p>tip',
    );
    expect(held).toBe("");
    expect(visible.includes("<aside data-type=\"callout\"")).toBe(true);
    expect(visible.endsWith("</aside>")).toBe(true);
  });

  it("does not hold bold markers inside streaming code fence", () => {
    const { visible, held } = safePartialMarkdown(
      "上文\n```js\nconst a = b ** c",
    );
    expect(held).toBe("");
    expect(visible.includes("b ** c")).toBe(true);
  });

  it("passes complete blocks", () => {
    const md =
      'a\n<aside data-type="callout"><p>t</p></aside>\n```js\n1\n```\n';
    const { visible, held } = safePartialMarkdown(md);
    expect(held).toBe("");
    expect(visible).toBe(md);
  });

  it("holds unclosed bold until closed", () => {
    const mid = safePartialMarkdown("前言**粗");
    expect(mid.visible).toBe("前言");
    expect(mid.held).toBe("**粗");

    const done = safePartialMarkdown("前言**粗体**后面");
    expect(done.held).toBe("");
    expect(done.visible).toBe("前言**粗体**后面");
  });

  it("escapes ordered-list line so typewriter can keep going", () => {
    const mid = safePartialMarkdown("上段\n1. 第");
    expect(mid.held).toBe("");
    expect(mid.visible).toBe("上段\n1\\. 第");

    const done = safePartialMarkdown("上段\n1. 第一点\n下段");
    expect(done.held).toBe("");
    expect(done.visible).toBe("上段\n1. 第一点\n下段");
  });

  it("escapes heading line while streaming", () => {
    const mid = safePartialMarkdown("正文\n## 标");
    expect(mid.held).toBe("");
    expect(mid.visible).toBe("正文\n\\## 标");
  });

  it("plain paragraph still fully visible (typewriter path)", () => {
    const md = "采用左右分栏：左侧为品牌视觉区";
    const { visible, held } = safePartialMarkdown(md);
    expect(held).toBe("");
    expect(visible).toBe(md);
  });

  it("holds incomplete link", () => {
    const mid = safePartialMarkdown("见[链");
    expect(mid.visible).toBe("见");
    expect(mid.held).toBe("[链");
  });
});

describe("enforceSingleCallout", () => {
  it("keeps only the first callout", () => {
    const md =
      '<aside data-type="callout"><p>a</p></aside>\n' +
      "body\n" +
      '<aside data-type="callout"><p>b</p></aside>';
    const next = enforceSingleCallout(md);
    expect(next.match(/data-type="callout"/g)?.length).toBe(1);
    expect(next.includes("<p>a</p>")).toBe(true);
    expect(next.includes("<p>b</p>")).toBe(false);
  });
});

describe("projectJsonToEvents", () => {
  it("expands compact project JSON into node/delta/done", () => {
    const events = [
      ...projectJsonToEvents(
        JSON.stringify({
          name: "Demo",
          tree: [
            {
              title: "根",
              content: "正文一二",
              children: [{ title: "子", content: "", children: [] }],
            },
          ],
        }),
        { deltaChunk: 2 },
      ),
    ];
    expect(events[0]).toEqual({ type: "project", name: "Demo" });
    expect(events.some((e) => e.type === "node" && e.title === "根")).toBe(
      true,
    );
    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(1);
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});
