/**
 * 插件注册表：本期仅内置模板。
 */

import type { WanGouPlugin } from "./types";
import { emptyTemplate } from "./templates/empty";
import { sampleTemplate } from "./templates/sample";

const plugins: WanGouPlugin[] = [emptyTemplate, sampleTemplate];

export function listPlugins(): WanGouPlugin[] {
  return [...plugins];
}

export function getPlugin(id: string): WanGouPlugin | undefined {
  return plugins.find((p) => p.id === id);
}

export function listTemplates(): WanGouPlugin[] {
  return plugins.filter((p) => p.id.startsWith("template."));
}
