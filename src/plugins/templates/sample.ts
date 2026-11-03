/**
 * 示例模板：内容来自用户校准的「万构使用指南.wango」。
 * 每次新建会重新发 id，避免多 tab 撞号。
 */

import { createNode, type ProjectData, type TreeNode } from "@/domain";
import type { WanGouPlugin } from "../types";
import {
  SAMPLE_GUIDE_SEED,
  type SampleSeedNode,
} from "./sampleGuideData";

function fromSeed(node: SampleSeedNode): TreeNode {
  return createNode({
    title: node.title,
    content: node.content,
    children: (node.children ?? []).map(fromSeed),
  });
}

function buildSample(): ProjectData {
  return {
    name: SAMPLE_GUIDE_SEED.name,
    tree: SAMPLE_GUIDE_SEED.tree.map(fromSeed),
    // 词表字段与空项目对齐；旧模板缺省时由 ensureProjectName / migrate 补全
    glossary: [],
    glossaryLinks: [],
    glossaryLogs: [],
  };
}

export const sampleTemplate: WanGouPlugin = {
  id: "template.sample",
  name: "使用指南（示例）",
  description: "树、正文、词表、Agent、导出与上手清单",
  getInitialData: buildSample,
};
