/**
 * 应用展示版本：与 package.json / tauri.conf.json 同源。
 * 「设置 → 关于」只读这里，勿再手写常量。
 */
import pkg from "../package.json";

export const APP_VERSION: string = pkg.version;
