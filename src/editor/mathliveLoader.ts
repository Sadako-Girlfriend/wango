/**
 * 按需加载 MathLive（体积大，首次点「公式」再拉）。
 * 字体走 CSS 导入，避免 Vite 下 ./fonts 404。
 */

import { getLocale, subscribeLocale } from "@/i18n";
import type { MathfieldElement } from "mathlive";
import { MATHLIVE_ZH_CN_STRINGS } from "./mathliveZhStrings";

export type MathLiveModule = typeof import("mathlive");

let loadPromise: Promise<MathLiveModule> | null = null;
let localeUnsub: (() => void) | null = null;

function applyMathLiveLocale(ml: MathLiveModule) {
  ml.MathfieldElement.locale = getLocale() === "en" ? "en" : "zh-cn";
}

export function ensureMathLive(): Promise<MathLiveModule> {
  if (!loadPromise) {
    loadPromise = (async () => {
      await import("mathlive/fonts.css");
      const ml = await import("mathlive");
      // 字体由 fonts.css 提供；关掉提示音目录请求
      ml.MathfieldElement.soundsDirectory = null;
      // 补全官方 zh-cn 缺失的「插入」等词条
      ml.MathfieldElement.strings = { "zh-cn": MATHLIVE_ZH_CN_STRINGS };
      applyMathLiveLocale(ml);
      if (!localeUnsub) {
        localeUnsub = subscribeLocale(() => applyMathLiveLocale(ml));
      }
      return ml;
    })();
  }
  return loadPromise;
}

export type { MathfieldElement };
