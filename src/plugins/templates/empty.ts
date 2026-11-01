/** 空项目模板 */
import { createEmptyProject } from "@/domain";
import type { WanGouPlugin } from "../types";

export const emptyTemplate: WanGouPlugin = {
  id: "template.empty",
  name: "空项目",
  description: "从单个根节点开始",
  getInitialData: () => createEmptyProject(),
};
