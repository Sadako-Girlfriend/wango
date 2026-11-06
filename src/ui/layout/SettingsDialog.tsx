/**
 * 本机设置：常规 / AI / 关于（含万构论）；API Key 仅本机，不进文档。
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AppSettings } from "@/desktop/appSettings";
import { isTauriRuntime } from "@/desktop/draftStore";
import { WANGO_PHILOSOPHY } from "@/content/wangoPhilosophy";
import { mergeHotkeys, type HotkeyMap } from "@/hotkeys";
import { setLocale, type Locale } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import { APP_VERSION } from "@/appVersion";
import { HotkeysSettingsPanel } from "./HotkeysSettingsPanel";
import styles from "./SettingsDialog.module.css";

export type SettingsTab = "general" | "ai" | "hotkeys" | "about";

export interface SettingsDraft {
  locale: Locale;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  hideExportWatermark: boolean;
  defaultExportDir: string;
  webSearchEnabled: boolean;
  hotkeys: HotkeyMap;
}

interface SettingsDialogProps {
  initial: AppSettings;
  onSave: (draft: SettingsDraft) => void | Promise<void>;
  onCancel: () => void;
}

export function SettingsDialog({
  initial,
  onSave,
  onCancel,
}: SettingsDialogProps) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [openedLocale] = useState<Locale>(() => locale);
  const [draftLocale, setDraftLocale] = useState<Locale>(locale);
  const [apiBaseUrl, setApiBaseUrl] = useState(initial.apiBaseUrl);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [model, setModel] = useState(initial.model);
  const [webSearchEnabled, setWebSearchEnabled] = useState(
    initial.webSearchEnabled === true,
  );
  const [hideExportWatermark, setHideExportWatermark] = useState(
    initial.hideExportWatermark,
  );
  const [defaultExportDir, setDefaultExportDir] = useState(
    initial.defaultExportDir,
  );
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() =>
    mergeHotkeys(initial.hotkeys),
  );
  const [saving, setSaving] = useState(false);

  const pickLocale = (next: Locale) => {
    setDraftLocale(next);
    setLocale(next);
  };

  const cancel = useCallback(() => {
    setLocale(openedLocale);
    onCancel();
  }, [openedLocale, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancel]);

  const pickExportDir = async () => {
    if (!isTauriRuntime()) {
      window.alert(t("settings.exportDirDesktopOnly"));
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultExportDir || undefined,
    });
    if (typeof picked === "string" && picked) {
      setDefaultExportDir(picked);
    }
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        locale: draftLocale,
        apiBaseUrl,
        apiKey,
        model,
        hideExportWatermark,
        defaultExportDir,
        webSearchEnabled,
        hotkeys,
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={cancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-settings-title" className={styles.title}>
          {t("settings.title")}
        </h2>

        <div className={styles.body}>
          <nav className={styles.nav} aria-label={t("settings.title")}>
            {(
              [
                ["general", "settings.tabGeneral"],
                ["ai", "settings.tabAi"],
                ["hotkeys", "settings.tabHotkeys"],
                ["about", "settings.tabAbout"],
              ] as const
            ).map(([id, key]) => (
              <button
                key={id}
                type="button"
                className={styles.navBtn}
                data-active={tab === id || undefined}
                onClick={() => setTab(id)}
              >
                {t(key)}
              </button>
            ))}
          </nav>

          <div className={styles.main}>
            {tab === "general" && (
              <section className={styles.section}>
                <label className={styles.field}>
                  <span className={styles.label}>{t("settings.language")}</span>
                  <div className={styles.langRow}>
                    <button
                      type="button"
                      className={styles.langBtn}
                      data-active={draftLocale === "zh-CN" || undefined}
                      onClick={() => pickLocale("zh-CN")}
                    >
                      {t("lang.zh")}
                    </button>
                    <button
                      type="button"
                      className={styles.langBtn}
                      data-active={draftLocale === "en" || undefined}
                      onClick={() => pickLocale("en")}
                    >
                      {t("lang.en")}
                    </button>
                  </div>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>
                    {t("settings.defaultExportDir")}
                  </span>
                  <p className={styles.hint}>
                    {t("settings.defaultExportDirHint")}
                  </p>
                  <div className={styles.pathRow}>
                    <input
                      className={styles.input}
                      value={defaultExportDir}
                      readOnly
                      placeholder={t("settings.defaultExportDirPlaceholder")}
                      title={defaultExportDir || undefined}
                    />
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => void pickExportDir()}
                    >
                      {t("settings.chooseFolder")}
                    </button>
                    {defaultExportDir ? (
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => setDefaultExportDir("")}
                      >
                        {t("settings.clearFolder")}
                      </button>
                    ) : null}
                  </div>
                </label>

                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={hideExportWatermark}
                    onChange={(e) => setHideExportWatermark(e.target.checked)}
                  />
                  <span>
                    <span className={styles.checkLabel}>
                      {t("settings.hideExportWatermark")}
                    </span>
                    <span className={styles.checkHint}>
                      {t("settings.hideExportWatermarkHint")}
                    </span>
                  </span>
                </label>
              </section>
            )}

            {tab === "ai" && (
              <section className={styles.section}>
                <p className={styles.hint}>{t("settings.apiLocalOnly")}</p>
                <label className={styles.field}>
                  <span className={styles.label}>{t("settings.apiBaseUrl")}</span>
                  <input
                    className={styles.input}
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder={t("settings.apiBaseUrlPlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t("settings.apiKey")}</span>
                  <input
                    className={styles.input}
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t("settings.apiKeyPlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t("settings.model")}</span>
                  <input
                    className={styles.input}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={t("settings.modelPlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={webSearchEnabled}
                    onChange={(e) => setWebSearchEnabled(e.target.checked)}
                  />
                  <span>
                    <span className={styles.checkLabel}>
                      {t("settings.webSearch")}
                    </span>
                    <span className={styles.checkHint}>
                      {t("settings.webSearchHint")}
                    </span>
                  </span>
                </label>
              </section>
            )}

            {tab === "hotkeys" && (
              <HotkeysSettingsPanel value={hotkeys} onChange={setHotkeys} />
            )}

            {tab === "about" && (
              <section className={styles.about}>
                <div className={styles.aboutHead}>
                  <div className={styles.aboutName}>{t("settings.aboutApp")}</div>
                  <div className={styles.aboutMeta}>
                    {t("settings.aboutVersion", { version: APP_VERSION })}
                  </div>
                  <p className={styles.aboutTagline}>
                    {t("settings.aboutTagline")}
                  </p>
                </div>
                <div className={styles.philosophy}>
                  <div className={styles.philosophyEyebrow}>
                    WANGO · PHILOSOPHY
                  </div>
                  {WANGO_PHILOSOPHY.map((block, i) => {
                    if (block.type === "title") {
                      return (
                        <h3 key={i} className={styles.phiTitle}>
                          {block.text}
                        </h3>
                      );
                    }
                    if (block.type === "subtitle") {
                      return (
                        <p key={i} className={styles.phiSubtitle}>
                          {block.text}
                        </p>
                      );
                    }
                    if (block.type === "chapter") {
                      return (
                        <h4 key={i} className={styles.phiChapter}>
                          {block.text}
                        </h4>
                      );
                    }
                    if (block.type === "closing") {
                      return (
                        <p key={i} className={styles.phiClosing}>
                          {block.text}
                        </p>
                      );
                    }
                    return (
                      <p key={i} className={styles.phiP}>
                        {block.text}
                      </p>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={cancel}>
            {tab === "about" ? t("settings.close") : t("settings.cancel")}
          </button>
          {tab !== "about" && (
            <button
              type="button"
              className={styles.primary}
              disabled={saving}
              onClick={() => void submit()}
            >
              {t("settings.save")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
