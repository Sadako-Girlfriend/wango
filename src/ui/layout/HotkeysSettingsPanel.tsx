/**
 * 设置 → 快捷键：列表、点击录制、冲突提示、恢复默认。
 */

import { useEffect, useState } from "react";
import {
  chordFromEvent,
  DEFAULT_HOTKEYS,
  findHotkeyConflicts,
  HOTKEY_DEFS,
  mergeHotkeys,
  normalizeChord,
  type HotkeyId,
  type HotkeyMap,
} from "@/hotkeys";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import styles from "./SettingsDialog.module.css";

interface HotkeysSettingsPanelProps {
  value: HotkeyMap;
  onChange: (next: HotkeyMap) => void;
}

export function HotkeysSettingsPanel({
  value,
  onChange,
}: HotkeysSettingsPanelProps) {
  const { t } = useI18n();
  const [recording, setRecording] = useState<HotkeyId | null>(null);
  const conflicts = findHotkeyConflicts(value);
  const conflictIds = new Set(conflicts.flat());

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      // 单修饰键不算
      if (
        chord === "Ctrl" ||
        chord === "Alt" ||
        chord === "Shift" ||
        chord === "Meta"
      ) {
        return;
      }
      onChange({ ...value, [recording]: normalizeChord(chord) });
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, value, onChange]);

  return (
    <section className={styles.section} data-wg-hotkey-ignore>
      <p className={styles.hint}>{t("hotkeys.hint")}</p>
      {conflicts.length > 0 && (
        <p className={styles.hotkeyWarn}>{t("hotkeys.conflictWarn")}</p>
      )}
      <ul className={styles.hotkeyList}>
        {HOTKEY_DEFS.map((def) => {
          const chord = value[def.id] || DEFAULT_HOTKEYS[def.id];
          const busy = recording === def.id;
          const clash = conflictIds.has(def.id);
          return (
            <li key={def.id} className={styles.hotkeyRow}>
              <div className={styles.hotkeyMeta}>
                <span className={styles.hotkeyLabel}>
                  {t(def.labelKey as MessageKey)}
                </span>
                <span className={styles.hotkeyScope}>
                  {t(`hotkeys.scope.${def.scope}` as MessageKey)}
                </span>
              </div>
              <button
                type="button"
                className={styles.hotkeyChord}
                data-recording={busy || undefined}
                data-conflict={clash || undefined}
                onClick={() => setRecording(busy ? null : def.id)}
              >
                {busy ? t("hotkeys.recording") : chord}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={styles.ghost}
        onClick={() => onChange(mergeHotkeys(null))}
      >
        {t("hotkeys.resetDefaults")}
      </button>
    </section>
  );
}
