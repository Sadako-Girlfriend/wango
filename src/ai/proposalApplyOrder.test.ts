import { describe, expect, it } from "vitest";
import type { AgentProposal } from "@/domain";
import {
  orderProposalsForApply,
  remapProposalIds,
} from "./proposalApplyOrder";

const set = (
  id: string,
  nodeId: string,
  field: "title" | "content",
): AgentProposal => ({
  id,
  op: "set",
  target: "tree",
  nodeId,
  field,
  next: field === "title" ? "T" : "C",
});

const add = (
  id: string,
  parentId: string | null,
  title: string,
): AgentProposal => ({
  id,
  op: "addChild",
  target: "tree",
  parentId,
  title,
});

describe("orderProposalsForApply", () => {
  it("先标题后正文", () => {
    const ordered = orderProposalsForApply([
      set("c", "n1", "content"),
      set("t", "n1", "title"),
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["t", "c"]);
  });

  it("先建父节点再建子节点", () => {
    const ordered = orderProposalsForApply([
      add("child", "parent", "子"),
      add("parent", "root", "父"),
      set("body", "child", "content"),
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["parent", "child", "body"]);
  });
});

describe("remapProposalIds", () => {
  it("替换 parentId / nodeId", () => {
    const map = new Map([["tmp", "real"]]);
    expect(
      remapProposalIds(add("x", "tmp", "子"), map),
    ).toMatchObject({ parentId: "real" });
    expect(
      remapProposalIds(set("y", "tmp", "content"), map),
    ).toMatchObject({ nodeId: "real" });
  });
});
