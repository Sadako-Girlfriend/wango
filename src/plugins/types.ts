/**
 * 插件接口：模板本质是提供初始树的插件。
 */

import type { ProjectData } from "@/domain";

export interface WanGouPlugin {
  id: string;
  name: string;
  description: string;
  getInitialData(): ProjectData;
}
