/**
 * Agent 对话本机持久化：按项目键存，默认不进 .wango。
 * 键：有路径用规范化 filePath；草稿用 draft:{tabId}。
 * 存盘为 AgentSession（v2 多标签）；兼容旧版单线程 v1。
 */

import { normalizeProposal } from "@/ai/agentProposals";
import { createId } from "@/domain";
import type {
  AgentChat,
  AgentMessage,
  AgentProposal,
  AgentProposalStatus,
  AgentSession,
  AgentThread,
} from "@/domain";
import { isTauriRuntime, getAppDataDir, joinPath } from "./draftStore";

const LS_PREFIX = "wango.agent.v1:";
const REL_DIR = "agent";

export function emptyAgentChat(title = "新对话"): AgentChat {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyAgentSession(): AgentSession {
  const chat = emptyAgentChat();
  return {
    version: 2,
    activeChatId: chat.id,
    chats: [chat],
    updatedAt: chat.updatedAt,
  };
}

/** @deprecated 兼容旧调用 */
export function emptyAgentThread(): AgentThread {
  return {
    version: 1,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}

export function agentProjectKey(
  filePath: string | null | undefined,
  tabId: string,
): string {
  const path = (filePath ?? "").trim().replace(/\\/g, "/");
  if (path) return `file:${path}`;
  return `draft:${tabId}`;
}

function normalizeProposals(raw: unknown): AgentProposal[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AgentProposal[] = [];
  for (const item of raw) {
    const p = normalizeProposal(item);
    if (p) out.push(p);
  }
  return out.length ? out : undefined;
}

function normalizeProposalStatus(
  raw: unknown,
): Record<string, AgentProposalStatus> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, AgentProposalStatus> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === "pending" || v === "applied" || v === "skipped") out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeMessages(raw: unknown): AgentMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentMessage[] = [];
  for (const m of raw) {
    if (
      !m ||
      typeof m !== "object" ||
      typeof (m as AgentMessage).id !== "string" ||
      ((m as AgentMessage).role !== "user" &&
        (m as AgentMessage).role !== "assistant") ||
      typeof (m as AgentMessage).content !== "string" ||
      typeof (m as AgentMessage).at !== "string"
    ) {
      continue;
    }
    const proposals = normalizeProposals((m as AgentMessage).proposals);
    const proposalStatus = normalizeProposalStatus(
      (m as AgentMessage).proposalStatus,
    );
    const thinking =
      typeof (m as AgentMessage).thinking === "string"
        ? (m as AgentMessage).thinking!.trim()
        : "";
    out.push({
      id: (m as AgentMessage).id,
      role: (m as AgentMessage).role,
      content: (m as AgentMessage).content,
      at: (m as AgentMessage).at,
      ...(thinking ? { thinking } : {}),
      ...(proposals ? { proposals } : {}),
      ...(proposalStatus ? { proposalStatus } : {}),
    });
  }
  return out;
}

function titleFromMessages(messages: AgentMessage[], fallback: string): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim());
  if (!firstUser) return fallback;
  const line = firstUser.content.trim().split(/\r?\n/)[0] ?? "";
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.length > 24 ? `${compact.slice(0, 24)}…` : compact;
}

function normalizeChat(raw: unknown, fallbackTitle: string): AgentChat | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<AgentChat>;
  const id =
    typeof o.id === "string" && o.id.trim() ? o.id.trim() : createId();
  const messages = normalizeMessages(o.messages);
  const createdAt =
    typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString();
  const updatedAt =
    typeof o.updatedAt === "string" ? o.updatedAt : createdAt;
  const title =
    typeof o.title === "string" && o.title.trim()
      ? o.title.trim()
      : titleFromMessages(messages, fallbackTitle);
  return { id, title, messages, createdAt, updatedAt };
}

/** 把 v1 单线程或 v2 会话规范成 AgentSession */
export function normalizeAgentSession(raw: unknown): AgentSession {
  if (!raw || typeof raw !== "object") return emptyAgentSession();
  const o = raw as Record<string, unknown>;

  if (o.version === 2 && Array.isArray(o.chats)) {
    const chats: AgentChat[] = [];
    for (let i = 0; i < o.chats.length; i++) {
      const c = normalizeChat(o.chats[i], `对话 ${i + 1}`);
      if (c) chats.push(c);
    }
    if (!chats.length) return emptyAgentSession();
    const active =
      typeof o.activeChatId === "string" &&
      chats.some((c) => c.id === o.activeChatId)
        ? o.activeChatId
        : chats[0]!.id;
    return {
      version: 2,
      activeChatId: active,
      chats,
      updatedAt:
        typeof o.updatedAt === "string"
          ? o.updatedAt
          : new Date().toISOString(),
    };
  }

  // v1 或裸 messages
  const messages = normalizeMessages(
    Array.isArray(o.messages) ? o.messages : [],
  );
  const updatedAt =
    typeof o.updatedAt === "string"
      ? o.updatedAt
      : new Date().toISOString();
  const chat: AgentChat = {
    id: createId(),
    title: titleFromMessages(messages, "对话"),
    messages,
    createdAt: updatedAt,
    updatedAt,
  };
  return {
    version: 2,
    activeChatId: chat.id,
    chats: [chat],
    updatedAt,
  };
}

/** @deprecated 仅兼容；内部走 session */
export function normalizeAgentThread(raw: unknown): AgentThread {
  const session = normalizeAgentSession(raw);
  const chat =
    session.chats.find((c) => c.id === session.activeChatId) ??
    session.chats[0];
  return {
    version: 1,
    messages: chat?.messages ?? [],
    updatedAt: session.updatedAt,
  };
}

export function activeChatOf(session: AgentSession): AgentChat {
  return (
    session.chats.find((c) => c.id === session.activeChatId) ??
    session.chats[0] ??
    emptyAgentChat()
  );
}

export function withActiveChat(
  session: AgentSession,
  patch: Partial<Pick<AgentChat, "messages" | "title" | "updatedAt">>,
): AgentSession {
  const now = new Date().toISOString();
  const chats = session.chats.map((c) =>
    c.id === session.activeChatId
      ? {
          ...c,
          ...patch,
          updatedAt: patch.updatedAt ?? now,
          title:
            patch.title ??
            (patch.messages
              ? titleFromMessages(patch.messages, c.title)
              : c.title),
        }
      : c,
  );
  return { ...session, chats, updatedAt: now };
}

function safeFileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

export async function loadAgentSession(key: string): Promise<AgentSession> {
  try {
    if (isTauriRuntime()) {
      const { readTextFile, exists, mkdir } = await import(
        "@tauri-apps/plugin-fs"
      );
      const root = await getAppDataDir();
      const dir = joinPath(root, REL_DIR);
      await mkdir(dir, { recursive: true });
      const abs = joinPath(dir, `${safeFileName(key)}.json`);
      if (!(await exists(abs))) return emptyAgentSession();
      const text = await readTextFile(abs);
      return normalizeAgentSession(JSON.parse(text));
    }
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return emptyAgentSession();
    return normalizeAgentSession(JSON.parse(raw));
  } catch (err) {
    console.warn("读取 Agent 会话失败", err);
    return emptyAgentSession();
  }
}

/** @deprecated */
export async function loadAgentThread(key: string): Promise<AgentThread> {
  const session = await loadAgentSession(key);
  const chat = activeChatOf(session);
  return {
    version: 1,
    messages: chat.messages,
    updatedAt: session.updatedAt,
  };
}

export async function saveAgentSession(
  key: string,
  session: AgentSession,
): Promise<void> {
  const payload: AgentSession = {
    ...session,
    version: 2,
    updatedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  try {
    if (isTauriRuntime()) {
      const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
      const root = await getAppDataDir();
      const dir = joinPath(root, REL_DIR);
      await mkdir(dir, { recursive: true });
      await writeTextFile(joinPath(dir, `${safeFileName(key)}.json`), body);
      return;
    }
    localStorage.setItem(LS_PREFIX + key, body);
  } catch (err) {
    console.warn("写入 Agent 会话失败", err);
  }
}

/** @deprecated */
export async function saveAgentThread(
  key: string,
  thread: AgentThread,
): Promise<void> {
  await saveAgentSession(key, normalizeAgentSession(thread));
}

/** 草稿另存为文件后：把会话迁到新键 */
export async function migrateAgentSession(
  fromKey: string,
  toKey: string,
): Promise<AgentSession> {
  if (fromKey === toKey) return loadAgentSession(toKey);
  const session = await loadAgentSession(fromKey);
  await saveAgentSession(toKey, session);
  return session;
}

/** @deprecated */
export async function migrateAgentThread(
  fromKey: string,
  toKey: string,
): Promise<AgentThread> {
  const session = await migrateAgentSession(fromKey, toKey);
  const chat = activeChatOf(session);
  return {
    version: 1,
    messages: chat.messages,
    updatedAt: session.updatedAt,
  };
}
