import { describe, expect, it } from "vitest";
import {
  annotateProposalBodyPreview,
  findPendingBodyDiffProposal,
  proposalDiffOps,
  resolveProposalNewText,
} from "./proposalDiff";
import type { AgentProposal } from "./agentProposals";
import type { AgentMessage, ProjectData, TreeNode } from "@/domain";

const root: TreeNode = {
  id: "root",
  title: "根",
  content: "旧段甲\n\n旧段乙",
  children: [],
  attachments: [],
};

const project = {
  name: "测",
  tree: [root],
  glossary: [],
  glossaryLinks: [],
  glossaryLogs: [],
} as ProjectData;

describe("proposalDiffOps", () => {
  it("set content：标出删旧增新", () => {
    const p = {
      id: "1",
      op: "set",
      target: "tree",
      nodeId: "root",
      field: "content",
      next: "旧段甲\n\n新段丙",
    } as AgentProposal;
    expect(proposalDiffOps(project, p)).toEqual([
      { type: "equal", text: "旧段甲" },
      { type: "del", text: "旧段乙" },
      { type: "add", text: "新段丙" },
    ]);
  });

  it("addChild：整段 add", () => {
    const p = {
      id: "2",
      op: "addChild",
      target: "tree",
      parentId: "root",
      title: "子题",
      content: "正文",
    } as AgentProposal;
    expect(proposalDiffOps(project, p)).toEqual([
      { type: "add", text: "子题\n\n正文" },
    ]);
    expect(resolveProposalNewText(p)).toBe("子题\n\n正文");
  });
});

describe("annotateProposalBodyPreview", () => {
  it("正文提案生成红绿壳", () => {
    const p = {
      id: "1",
      op: "set",
      target: "tree",
      nodeId: "root",
      field: "content",
      next: "新全文",
    } as AgentProposal;
    const md = annotateProposalBodyPreview(project, p);
    expect(md).toContain('data-wg-diff="del"');
    expect(md).toContain('data-wg-diff="add"');
  });

  it("findPendingBodyDiffProposal 只匹配当前节点待确认正文", () => {
    const messages: AgentMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: "x",
        at: "",
        proposals: [
          {
            id: "p1",
            op: "set",
            target: "tree",
            nodeId: "root",
            field: "content",
            next: "新",
          },
        ],
        proposalStatus: { p1: "pending" },
      },
    ];
    expect(
      findPendingBodyDiffProposal(messages, { scope: "tree", id: "root" })?.id,
    ).toBe("p1");
    expect(
      findPendingBodyDiffProposal(messages, { scope: "tree", id: "other" }),
    ).toBeNull();
  });
});
