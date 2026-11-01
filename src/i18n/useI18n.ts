/**
 * React 订阅：切换语言时重渲染。
 */

import { useEffect, useState } from "react";
import {
  getLocale,
  setLocale,
  subscribeLocale,
  t,
  type Locale,
  type MessageKey,
} from "./index";

export function useI18n() {
  const [locale, setLocalState] = useState<Locale>(getLocale);

  useEffect(() => subscribeLocale(() => setLocalState(getLocale())), []);

  return {
    locale,
    setLocale: (next: Locale) => setLocale(next),
    t: (key: MessageKey, vars?: Record<string, string | number>) => t(key, vars),
  };
}
