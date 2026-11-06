/**
 * 右侧 Agent：全量项目上下文对话；改稿提案需确认后应用。
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildAgentSystemPrompt, runAgentReply } from "@/ai/agentChat";
import {
  emptyProposalStatus,
  extractProposalsFromReply,
  type AgentProposal,
} from "@/ai/agentProposals";
import {
  orderProposalsForApply,
  remapProposalIds,
} from "@/ai/proposalApplyOrder";
import {
  proposalDiffOps,
  resolveProposalNewText,
} from "@/ai/proposalDiff";
import { maybeAgentWebSearch } from "@/ai/deepseekTools";
import { ensureApiSettings, isApiConfigured } from "@/ai/openaiCompat";
import {
  getAppSettings,
  loadAppSettings,
  saveAppSettings,
} from "@/desktop/appSettings";
import {
  findGlossaryById,
  findNodeById,
  resolveGlossaryTitle,
  type ProjectData,
} from "@/domain";
import type { DiffOp } from "@/editor/contentDiff";
import { useI18n } from "@/i18n/useI18n";
import { useAgentStore } from "@/store/agentStore";
import styles from "./AgentPane.module.css";

const PREVIEW_CHAR_BUDGET = 900;

function truncatePreviewText(text: string, budget: number): {
  text: string;
  used: number;
  truncated: boolean;
} {
  if (text.length <= budget) {
    return { text, used: text.length, truncated: false };
  }
  return {
    text: `${text.slice(0, Math.max(0, budget - 1))}…`,
    used: budget,
    truncated: true,
  };
}

/** 待确认：红绿对照；已应用/跳过：纯终稿（红绿消失） */
function ProposalPreviewBody({
  ops,
  plain,
  pending,
}: {
  ops: DiffOp[];
  plain: string;
  pending: boolean;
}) {
  if (!pending) {
    const { text } = truncatePreviewText(plain, PREVIEW_CHAR_BUDGET);
    return <>{text}</>;
  }
  let left = PREVIEW_CHAR_BUDGET;
  const parts: ReactNode[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (left <= 0) {
      parts.push(
        <div key={`more-${i}`} className={styles.diffMore}>
          …
        </div>,
      );
      break;
    }
    const op = ops[i]!;
    const slice = truncatePreviewText(op.text, left);
    left -= slice.used;
    const cls =
      op.type === "add"
        ? styles.diffAdd
        : op.type === "del"
          ? styles.diffDel
          : styles.diffEq;
    parts.push(
      <div key={i} className={cls} data-diff={op.type}>
        {slice.text}
      </div>,
    );
    if (slice.truncated) {
      break;
    }
  }
  return <>{parts}</>;
}

interface AgentPaneProps {
  project: ProjectData;
  focus: { scope: "tree" | "glossary"; id: string; title: string } | null;
  onOpenSettings: () => void;
  /** 成功返回节点 id（新建为新 id）；失败返回 false */
  onApplyProposal: (proposal: AgentProposal) => string | false;
}

export function AgentPane({
  project,
  focus,
  onOpenSettings,
  onApplyProposal,
}: AgentPaneProps) {
  const { t } = useI18n();
  const session = useAgentStore((s) => s.session);
  const sending = useAgentStore((s) => s.sending);
  const error = useAgentStore((s) => s.error);
  const activeChat =
    session.chats.find((c) => c.id === session.activeChatId) ??
    session.chats[0];
  const messages = activeChat?.messages ?? [];
  const [draft, setDraft] = useState("");
  const [webSearchOn, setWebSearchOn] = useState(
    () => getAppSettings().webSearchEnabled === true,
  );
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [msgMenu, setMsgMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
    content: string;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadAppSettings().then((s) => {
      setWebSearchOn(s.webSearchEnabled === true);
    });
  }, []);

  const focusLabel = useMemo(() => {
    if (!focus) return t("agent.contextNone");
    return t("agent.contextNode", { title: focus.title });
  }, [focus, t]);

  // 仅在发送中跟到底；结束后不抢用户上滚去点「应用」
  useEffect(() => {
    if (!sending) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending, session.activeChatId]);

  // 旧消息：正文里嵌套 ``` 曾导致提案解析失败；打开对话时补救一次
  useEffect(() => {
    if (sending) return;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      if (m.proposals?.length) continue;
      if (
        !m.content.includes("wango-proposals") &&
        !/```json\b/i.test(m.content)
      ) {
        continue;
      }
      const { display, proposals } = extractProposalsFromReply(m.content);
      if (!proposals.length) continue;
      void useAgentStore.getState().finishAssistant(m.id, {
        content: display,
        proposals,
      });
    }
  }, [messages, sending, session.activeChatId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    useAgentStore.getState().setSending(false);
  };

  const resolveAnchorTitle = (p: AgentProposal): string => {
    if (p.op === "addChild") {
      if (!p.parentId) {
        return p.target === "glossary" ? t("agent.parentRoot") : "—";
      }
      if (p.target === "tree") {
        return (
          findNodeById(project.tree, p.parentId)?.title?.trim() || p.parentId
        );
      }
      const parent = findGlossaryById(project.glossary, p.parentId);
      if (!parent) return p.parentId;
      return resolveGlossaryTitle(parent, project.tree).trim() || p.parentId;
    }
    if (p.target === "tree") {
      return findNodeById(project.tree, p.nodeId)?.title?.trim() || p.nodeId;
    }
    const entry = findGlossaryById(project.glossary, p.nodeId);
    if (!entry) return p.nodeId;
    return resolveGlossaryTitle(entry, project.tree).trim() || p.nodeId;
  };

  const proposalKindLabel = (p: AgentProposal): string => {
    if (p.op === "addChild") return t("agent.opAddChild");
    return p.field === "title" ? t("agent.fieldTitle") : t("agent.fieldContent");
  };

  const applyOne = (p: AgentProposal): string | false => {
    try {
      return onApplyProposal(p);
    } catch (err) {
      console.error("apply proposal failed", err);
      return false;
    }
  };

  const activeMessages = () => {
    const s = useAgentStore.getState().session;
    const chat =
      s.chats.find((c) => c.id === s.activeChatId) ?? s.chats[0];
    return chat?.messages ?? [];
  };

  /** 当前对话里所有待确认提案（跨多条助手消息） */
  const pendingItems = useMemo(() => {
    const items: { messageId: string; proposal: AgentProposal }[] = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !m.proposals?.length) continue;
      const status = m.proposalStatus ?? emptyProposalStatus(m.proposals);
      for (const p of m.proposals) {
        if ((status[p.id] ?? "pending") === "pending") {
          items.push({ messageId: m.id, proposal: p });
        }
      }
    }
    return items;
  }, [messages]);

  const applyAllPending = () => {
    if (!pendingItems.length) return;
    const ordered = orderProposalsForApply(
      pendingItems.map((i) => i.proposal),
    );
    const messageByProposal = new Map(
      pendingItems.map((i) => [i.proposal.id, i.messageId]),
    );
    const idMap = new Map<string, string>();
    const patches = new Map<string, Record<string, "applied" | "skipped">>();
    let failCount = 0;

    for (const raw of ordered) {
      const messageId = messageByProposal.get(raw.id);
      if (!messageId) continue;
      const p = remapProposalIds(raw, idMap);
      const result = applyOne(p);
      if (result === false) {
        failCount += 1;
        continue;
      }
      if (raw.op === "addChild") {
        idMap.set(raw.id, result);
      }
      const patch = patches.get(messageId) ?? {};
      patch[raw.id] = "applied";
      patches.set(messageId, patch);
    }

    for (const [messageId, patch] of patches) {
      void useAgentStore.getState().setProposalStatuses(messageId, patch);
    }
    if (failCount > 0) {
      window.alert(t("agent.applyAllPartial", { n: String(failCount) }));
    }
  };

  const skipAllPending = () => {
    if (!pendingItems.length) return;
    const patches = new Map<string, Record<string, "skipped">>();
    for (const { messageId, proposal } of pendingItems) {
      const patch = patches.get(messageId) ?? {};
      patch[proposal.id] = "skipped";
      patches.set(messageId, patch);
    }
    for (const [messageId, patch] of patches) {
      void useAgentStore.getState().setProposalStatuses(messageId, patch);
    }
  };

  const editSentMessage = async (messageId: string, content: string) => {
    if (sending) stop();
    setMsgMenu(null);
    await useAgentStore.getState().truncateFromMessage(messageId);
    setDraft(content);
    setSearchStatus(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = content.length;
      el.setSelectionRange(len, len);
    });
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const cfg = await ensureApiSettings();
    if (!isApiConfigured(cfg)) {
      window.alert(t("inspire.apiMissing"));
      onOpenSettings();
      return;
    }

    const store = useAgentStore.getState();
    store.appendUser(text);
    setDraft("");
    store.setSending(true);
    store.setError(null);

    const assistantId = store.beginAssistant();
    const history = activeMessages()
      .filter((m) => m.id !== assistantId)
      .map((m) => ({ role: m.role, content: m.content }));

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      let system = buildAgentSystemPrompt({ project, focus });
      setSearchStatus(null);
      if (webSearchOn || getAppSettings().webSearchEnabled) {
        setSearchStatus(t("agent.webSearchRunning"));
        const searched = await maybeAgentWebSearch({
          userText: text,
          signal: ac.signal,
        });
        if (searched == null) {
          setSearchStatus(t("agent.webSearchFailed"));
        } else if (searched.hitCount > 0 && searched.context) {
          system = `${system}\n\n${searched.context}`;
          setSearchStatus(
            t("agent.webSearchHits", { n: String(searched.hitCount) }),
          );
        } else {
          setSearchStatus(t("agent.webSearchHits", { n: "0" }));
        }
      }
      for await (const part of runAgentReply({
        system,
        history,
        signal: ac.signal,
      })) {
        if (part.type === "reasoning") {
          useAgentStore
            .getState()
            .appendAssistantThinking(assistantId, part.text);
        } else {
          useAgentStore
            .getState()
            .appendAssistantDelta(assistantId, part.text);
        }
      }
      const done = activeMessages().find((m) => m.id === assistantId);
      const raw = done?.content ?? "";
      const { display, proposals } = extractProposalsFromReply(raw);
      await useAgentStore.getState().finishAssistant(assistantId, {
        content: display || raw,
        thinking: done?.thinking,
        proposals,
      });
    } catch (err) {
      if (ac.signal.aborted) {
        await useAgentStore
          .getState()
          .failAssistant(assistantId, t("agent.stopped"));
      } else {
        const msg =
          err instanceof Error && err.message === "API_NOT_CONFIGURED"
            ? t("inspire.apiMissing")
            : err instanceof Error
              ? err.message
              : t("agent.failed");
        await useAgentStore.getState().failAssistant(assistantId, msg);
      }
    } finally {
      abortRef.current = null;
      useAgentStore.getState().setSending(false);
    }
  };

  return (
    <div
      className={styles.root}
      data-wg-focus="agent"
      onWheel={(e) => {
        // 侧栏/浮层都拦住冒泡，滚轮只滚 Agent 列表
        e.stopPropagation();
      }}
    >
      <div className={styles.top}>
        <div className={styles.header}>
          <div className={styles.title}>{t("agent.title")}</div>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={sending}
            title={t("agent.newChatHint")}
            aria-label={t("agent.newChat")}
            onClick={() => {
              void useAgentStore.getState().newChat();
            }}
          >
            +
          </button>
        </div>
        <div
          className={styles.chatTabs}
          role="tablist"
          aria-label={t("agent.chats")}
        >
          {session.chats.map((chat) => {
            const active = chat.id === session.activeChatId;
            return (
              <div
                key={chat.id}
                className={styles.chatTab}
                data-active={active || undefined}
                role="presentation"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={styles.chatTabBtn}
                  disabled={sending && !active}
                  title={chat.title}
                  onClick={() => {
                    void useAgentStore.getState().selectChat(chat.id);
                  }}
                >
                  {chat.title}
                </button>
                <button
                  type="button"
                  className={styles.chatTabClose}
                  disabled={sending}
                  aria-label={t("agent.closeChat")}
                  title={t("agent.closeChat")}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (
                      chat.messages.length > 0 &&
                      !window.confirm(t("agent.closeChatConfirm"))
                    ) {
                      return;
                    }
                    void useAgentStore.getState().closeChat(chat.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className={styles.hint}>
          {focusLabel}
          <span className={styles.hintSep}>·</span>
          {t("agent.contextFull")}
          <span className={styles.hintSep}>·</span>
          <label
            className={styles.searchToggle}
            title={t("agent.webSearchToggle")}
          >
            <input
              type="checkbox"
              checked={webSearchOn}
              disabled={sending}
              onChange={(e) => {
                const on = e.target.checked;
                setWebSearchOn(on);
                const cur = getAppSettings();
                void saveAppSettings({ ...cur, webSearchEnabled: on });
              }}
            />
            <span>
              {webSearchOn ? t("agent.webSearchOn") : t("agent.webSearchOff")}
            </span>
          </label>
          {searchStatus ? (
            <>
              <span className={styles.hintSep}>·</span>
              <span>{searchStatus}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className={styles.list} ref={listRef}>
        {messages.length === 0 ? (
          <div className={styles.empty}>{t("agent.empty")}</div>
        ) : (
          messages.map((m) => {
            const status = m.proposalStatus ?? emptyProposalStatus(m.proposals ?? []);
            return (
              <div
                key={m.id}
                className={styles.bubble}
                data-role={m.role}
                onContextMenu={
                  m.role === "user" && m.content.trim()
                    ? (e) => {
                        e.preventDefault();
                        setMsgMenu({
                          x: e.clientX,
                          y: e.clientY,
                          messageId: m.id,
                          content: m.content,
                        });
                      }
                    : undefined
                }
              >
                <div className={styles.role}>
                  {m.role === "user" ? t("agent.you") : t("agent.bot")}
                </div>
                {m.role === "assistant" && m.thinking?.trim() ? (
                  <ThinkingBlock
                    text={m.thinking}
                    streaming={
                      sending &&
                      m.id === messages[messages.length - 1]?.id &&
                      !m.content.trim()
                    }
                    hasAnswer={Boolean(m.content.trim())}
                  />
                ) : null}
                {m.content.trim() ||
                (m.role === "assistant" &&
                  sending &&
                  !m.thinking?.trim()) ? (
                  <div className={styles.content}>
                    {m.content.trim() ? m.content : "…"}
                  </div>
                ) : null}
                {m.role === "assistant" && m.proposals?.length ? (
                  <div className={styles.proposals}>
                    <div className={styles.proposalsTitle}>
                      {t("agent.proposalsTitle")}
                    </div>
                    {m.proposals.map((p) => {
                      const st = status[p.id] ?? "pending";
                      return (
                        <div
                          key={p.id}
                          className={styles.proposal}
                          data-status={st}
                        >
                          <div className={styles.proposalMeta}>
                            <span>
                              {p.target === "tree"
                                ? t("agent.targetTree")
                                : t("agent.targetGlossary")}
                              {" · "}
                              {resolveAnchorTitle(p)}
                              {" · "}
                              {proposalKindLabel(p)}
                            </span>
                            {st !== "pending" ? (
                              <span className={styles.proposalBadge}>
                                {st === "applied"
                                  ? t("agent.applied")
                                  : t("agent.skipped")}
                              </span>
                            ) : null}
                          </div>
                          {p.note ? (
                            <div className={styles.proposalNote}>{p.note}</div>
                          ) : null}
                          <div
                            className={styles.proposalPreview}
                            data-diff={st === "pending" ? "live" : "done"}
                          >
                            <ProposalPreviewBody
                              pending={st === "pending"}
                              plain={resolveProposalNewText(p)}
                              ops={
                                st === "pending"
                                  ? proposalDiffOps(project, p)
                                  : []
                              }
                            />
                          </div>
                          {st === "pending" ? (
                            <div className={styles.proposalActions}>
                              <button
                                type="button"
                                className={styles.ghost}
                                onClick={() => {
                                  void useAgentStore
                                    .getState()
                                    .setProposalStatus(m.id, p.id, "skipped");
                                }}
                              >
                                {t("agent.skip")}
                              </button>
                              <button
                                type="button"
                                className={styles.primary}
                                onClick={() => {
                                  const ok = applyOne(p);
                                  if (ok === false) {
                                    window.alert(t("agent.applyFailed"));
                                    return;
                                  }
                                  void useAgentStore
                                    .getState()
                                    .setProposalStatus(m.id, p.id, "applied");
                                }}
                              >
                                {t("agent.apply")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {pendingItems.length > 0 ? (
        <div className={styles.reviewBar} role="region" aria-label={t("agent.reviewBar")}>
          <button
            type="button"
            className={styles.reviewCount}
            title={t("agent.reviewBarHint")}
            onClick={() => {
              const el = listRef.current;
              if (!el) return;
              const card = el.querySelector("[data-status='pending']");
              card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
          >
            ▸ {t("agent.pendingCount", { n: String(pendingItems.length) })}
          </button>
          <div className={styles.reviewActions}>
            <button
              type="button"
              className={styles.ghost}
              disabled={sending}
              onClick={skipAllPending}
            >
              {t("agent.skipAll")}
            </button>
            <button
              type="button"
              className={styles.reviewKeep}
              disabled={sending}
              onClick={applyAllPending}
            >
              {t("agent.applyAll")}
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.composer}>
        <div className={styles.composerShell}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={draft}
            rows={3}
            placeholder={t("agent.placeholder")}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className={styles.composerBar}>
            {sending ? (
              <button type="button" className={styles.ghost} onClick={stop}>
                {t("agent.stop")}
              </button>
            ) : (
              <span className={styles.composerHint}>{t("agent.sendHint")}</span>
            )}
            <button
              type="button"
              className={styles.sendBtn}
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
            >
              {sending ? t("agent.sending") : t("agent.send")}
            </button>
          </div>
        </div>
      </div>
      {msgMenu ? (
        <>
          <button
            type="button"
            className={styles.menuBackdrop}
            aria-label="close"
            onClick={() => setMsgMenu(null)}
          />
          <div
            className={styles.msgMenu}
            style={{ left: msgMenu.x, top: msgMenu.y }}
            role="menu"
          >
            <button
              type="button"
              className={styles.msgMenuItem}
              role="menuitem"
              onClick={() => {
                void editSentMessage(msgMenu.messageId, msgMenu.content);
              }}
            >
              {t("agent.editResend")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ThinkingBlock({
  text,
  streaming,
  hasAnswer,
}: {
  text: string;
  streaming: boolean;
  hasAnswer: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const autoClosed = useRef(false);

  useEffect(() => {
    if (streaming) {
      setOpen(true);
      autoClosed.current = false;
      return;
    }
    if (hasAnswer && !autoClosed.current) {
      autoClosed.current = true;
      setOpen(false);
    }
  }, [streaming, hasAnswer]);

  return (
    <details
      className={styles.thinking}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className={styles.thinkingSummary}>
        <span className={styles.thinkingCaret} aria-hidden>
          ▸
        </span>
        {streaming ? t("agent.thinkingLive") : t("agent.thinking")}
      </summary>
      <pre className={styles.thinkingBody}>{text}</pre>
    </details>
  );
}
