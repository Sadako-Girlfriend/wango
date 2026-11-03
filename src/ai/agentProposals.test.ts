import { describe, expect, it } from "vitest";
import {
  extractProposalsFromReply,
  normalizeProposal,
} from "./agentProposals";

describe("normalizeProposal", () => {
  it("无 op 视为 set", () => {
    const p = normalizeProposal({
      id: "p1",
      target: "tree",
      nodeId: "n1",
      field: "content",
      next: "新正文",
    });
    expect(p).toMatchObject({
      op: "set",
      target: "tree",
      nodeId: "n1",
      field: "content",
      next: "新正文",
    });
  });

  it("解析 addChild", () => {
    const p = normalizeProposal({
      id: "p2",
      op: "addChild",
      target: "tree",
      parentId: "parent",
      title: "子",
      content: "正文",
    });
    expect(p).toEqual({
      id: "p2",
      op: "addChild",
      target: "tree",
      parentId: "parent",
      title: "子",
      content: "正文",
      note: undefined,
    });
  });

  it("addGlossary 归一为 addChild+glossary；空 parentId 为根", () => {
    const p = normalizeProposal({
      op: "addGlossary",
      parentId: "",
      title: "词",
    });
    expect(p).toMatchObject({
      op: "addChild",
      target: "glossary",
      parentId: null,
      title: "词",
    });
  });

  it("非法字段丢弃", () => {
    expect(normalizeProposal({ op: "set", target: "tree" })).toBeNull();
    expect(
      normalizeProposal({ op: "addChild", target: "tree", parentId: 1 }),
    ).toBeNull();
    expect(normalizeProposal({ op: "delete" })).toBeNull();
  });
});

describe("extractProposalsFromReply", () => {
  it("抽出 wango-proposals 并去掉 fence", () => {
    const raw = [
      "已改写该节点。",
      "",
      "```wango-proposals",
      JSON.stringify({
        proposals: [
          {
            id: "p1",
            target: "tree",
            nodeId: "n1",
            field: "content",
            next: "新正文",
            note: "更冷一点",
          },
        ],
      }),
      "```",
    ].join("\n");
    const { display, proposals } = extractProposalsFromReply(raw);
    expect(display).toContain("已改写");
    expect(display).not.toContain("wango-proposals");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      op: "set",
      nodeId: "n1",
      next: "新正文",
    });
  });

  it("同 set 目标保留最后一条；多条 addChild 都保留", () => {
    const raw = `\`\`\`wango-proposals
{"proposals":[
  {"id":"a","target":"tree","nodeId":"n1","field":"title","next":"旧"},
  {"id":"b","target":"tree","nodeId":"n1","field":"title","next":"新"},
  {"id":"c","op":"addChild","target":"tree","parentId":"n1","title":"子1"},
  {"id":"d","op":"addChild","target":"tree","parentId":"n1","title":"子2"}
]}
\`\`\``;
    const { proposals } = extractProposalsFromReply(raw);
    const sets = proposals.filter((p) => p.op === "set");
    const adds = proposals.filter((p) => p.op === "addChild");
    expect(sets).toHaveLength(1);
    expect(sets[0]?.op === "set" && sets[0].next).toBe("新");
    expect(adds).toHaveLength(2);
  });
});
