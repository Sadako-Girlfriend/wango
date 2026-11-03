/**
 * 按项目键缓存 Agent 多标签对话；切换项目换视图，本机落盘可回来续聊。
 */

import { create } from "zustand";
import {
  createId,
  type AgentChat,
  type AgentMessage,
  type AgentProposal,
  type AgentProposalStatus,
  type AgentSession,
  type AgentThread,
} from "@/domain";
import {
  activeChatOf,
  agentProjectKey,
  emptyAgentChat,
  emptyAgentSession,
  loadAgentSession,
  migrateAgentSession,
  normalizeAgentSession,
  saveAgentSession,
  withActiveChat,
} from "@/desktop/agentPersist";

type AgentState = {
  activeKey: string | null;
  session: AgentSession;
  loading: boolean;
  sending: boolean;
  error: string | null;
  activate: (filePath: string | null, tabId: string) => Promise<void>;
  openFromPackage: (
    filePath: string | null,
    tabId: string,
    fromFile?: AgentSession | AgentThread | null,
  ) => Promise<void>;
  replaceSession: (session: AgentSession | AgentThread) => Promise<void>;
  /** @deprecated 清当前标签；请用 newChat */
  clearThread: () => Promise<void>;
  newChat: () => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  closeChat: (chatId: string) => Promise<void>;
  appendUser: (content: string) => AgentMessage;
  beginAssistant: () => string;
  appendAssistantDelta: (id: string, delta: string) => void;
  appendAssistantThinking: (id: string, delta: string) => void;
  finishAssistant: (
    id: string,
    payload?: {
      content?: string;
      thinking?: string;
      proposals?: AgentProposal[];
    },
  ) => Promise<void>;
  failAssistant: (id: string, message: string) => Promise<void>;
  setProposalStatus: (
    messageId: string,
    proposalId: string,
    status: AgentProposalStatus,
  ) => Promise<void>;
  setProposalStatuses: (
    messageId: string,
    patch: Record<string, AgentProposalStatus>,
  ) => Promise<void>;
  setSending: (v: boolean) => void;
  setError: (msg: string | null) => void;
  remountKey: (filePath: string | null, tabId: string) => Promise<void>;
};

let loadSeq = 0;

async function persist(key: string | null, session: AgentSession) {
  if (key) await saveAgentSession(key, session);
}

function mapActiveMessages(
  session: AgentSession,
  mapFn: (messages: AgentMessage[]) => AgentMessage[],
): AgentSession {
  const chat = activeChatOf(session);
  return withActiveChat(session, { messages: mapFn(chat.messages) });
}

export const useAgentStore = create<AgentState>((set, get) => ({
  activeKey: null,
  session: emptyAgentSession(),
  loading: false,
  sending: false,
  error: null,

  activate: async (filePath, tabId) => {
    const key = agentProjectKey(filePath, tabId);
    if (get().activeKey === key) return;
    const seq = ++loadSeq;
    set({ activeKey: key, loading: true, error: null });
    const session = await loadAgentSession(key);
    if (seq !== loadSeq) return;
    set({ session, loading: false });
  },

  openFromPackage: async (filePath, tabId, fromFile) => {
    const key = agentProjectKey(filePath, tabId);
    const seq = ++loadSeq;
    set({ activeKey: key, loading: true, error: null });
    if (fromFile) {
      const session = normalizeAgentSession(fromFile);
      const hasMsg = session.chats.some((c) => c.messages.length > 0);
      if (hasMsg) {
        await saveAgentSession(key, session);
        if (seq !== loadSeq) return;
        set({ session, loading: false });
        return;
      }
    }
    const session = await loadAgentSession(key);
    if (seq !== loadSeq) return;
    set({ session, loading: false });
  },

  replaceSession: async (raw) => {
    const session = normalizeAgentSession(raw);
    const key = get().activeKey;
    set({ session, error: null });
    await persist(key, session);
  },

  clearThread: async () => {
    const key = get().activeKey;
    const session = withActiveChat(get().session, {
      messages: [],
      title: "新对话",
    });
    set({ session, error: null });
    await persist(key, session);
  },

  newChat: async () => {
    if (get().sending) return;
    const chat = emptyAgentChat();
    const session: AgentSession = {
      ...get().session,
      chats: [...get().session.chats, chat],
      activeChatId: chat.id,
      updatedAt: chat.updatedAt,
    };
    set({ session, error: null });
    await persist(get().activeKey, session);
  },

  selectChat: async (chatId) => {
    if (get().sending) return;
    const session = get().session;
    if (!session.chats.some((c) => c.id === chatId)) return;
    if (session.activeChatId === chatId) return;
    const next: AgentSession = {
      ...session,
      activeChatId: chatId,
      updatedAt: new Date().toISOString(),
    };
    set({ session: next, error: null });
    await persist(get().activeKey, next);
  },

  closeChat: async (chatId) => {
    if (get().sending) return;
    const session = get().session;
    if (session.chats.length <= 1) {
      const only = session.chats[0];
      if (!only) return;
      const cleared = withActiveChat(
        { ...session, activeChatId: only.id },
        { messages: [], title: "新对话" },
      );
      set({ session: cleared, error: null });
      await persist(get().activeKey, cleared);
      return;
    }
    const chats = session.chats.filter((c) => c.id !== chatId);
    let activeChatId = session.activeChatId;
    if (activeChatId === chatId) {
      const idx = session.chats.findIndex((c) => c.id === chatId);
      const fallback = chats[Math.max(0, idx - 1)] ?? chats[0]!;
      activeChatId = fallback.id;
    }
    const next: AgentSession = {
      ...session,
      chats,
      activeChatId,
      updatedAt: new Date().toISOString(),
    };
    set({ session: next, error: null });
    await persist(get().activeKey, next);
  },

  appendUser: (content) => {
    const msg: AgentMessage = {
      id: createId(),
      role: "user",
      content,
      at: new Date().toISOString(),
    };
    const chat = activeChatOf(get().session);
    const messages = [...chat.messages, msg];
    const session = withActiveChat(get().session, { messages });
    set({ session, error: null });
    void persist(get().activeKey, session);
    return msg;
  },

  beginAssistant: () => {
    const id = createId();
    const msg: AgentMessage = {
      id,
      role: "assistant",
      content: "",
      thinking: "",
      at: new Date().toISOString(),
    };
    const chat = activeChatOf(get().session);
    const session = withActiveChat(get().session, {
      messages: [...chat.messages, msg],
    });
    set({ session });
    return id;
  },

  appendAssistantDelta: (id, delta) => {
    if (!delta) return;
    const session = mapActiveMessages(get().session, (messages) =>
      messages.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m,
      ),
    );
    set({ session });
  },

  appendAssistantThinking: (id, delta) => {
    if (!delta) return;
    const session = mapActiveMessages(get().session, (messages) =>
      messages.map((m) =>
        m.id === id
          ? { ...m, thinking: (m.thinking ?? "") + delta }
          : m,
      ),
    );
    set({ session });
  },

  finishAssistant: async (id, payload) => {
    const session = mapActiveMessages(get().session, (messages) =>
      messages.map((m) => {
        if (m.id !== id) return m;
        const proposals = payload?.proposals;
        const status: Record<string, AgentProposalStatus> = {};
        if (proposals?.length) {
          for (const p of proposals) status[p.id] = "pending";
        }
        const thinking =
          payload?.thinking != null ? payload.thinking : m.thinking;
        return {
          ...m,
          content: payload?.content != null ? payload.content : m.content,
          thinking: thinking?.trim() ? thinking : undefined,
          proposals: proposals?.length ? proposals : undefined,
          proposalStatus: proposals?.length ? status : undefined,
        };
      }),
    );
    set({ session });
    await persist(get().activeKey, session);
  },

  setProposalStatus: async (messageId, proposalId, status) => {
    await get().setProposalStatuses(messageId, { [proposalId]: status });
  },

  setProposalStatuses: async (messageId, patch) => {
    if (!Object.keys(patch).length) return;
    const session = mapActiveMessages(get().session, (messages) =>
      messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          proposalStatus: {
            ...(m.proposalStatus ?? {}),
            ...patch,
          },
        };
      }),
    );
    set({ session });
    await persist(get().activeKey, session);
  },

  failAssistant: async (id, message) => {
    const session = mapActiveMessages(get().session, (messages) =>
      messages.flatMap((m) => {
        if (m.id !== id) return [m];
        if (m.content.trim()) {
          return [
            {
              ...m,
              content: `${m.content}\n\n（中断：${message}）`,
            },
          ];
        }
        return [];
      }),
    );
    set({ session, error: message });
    await persist(get().activeKey, session);
  },

  setSending: (v) => set({ sending: v }),
  setError: (msg) => set({ error: msg }),

  remountKey: async (filePath, tabId) => {
    const nextKey = agentProjectKey(filePath, tabId);
    const prev = get().activeKey;
    if (!prev || prev === nextKey) {
      await get().activate(filePath, tabId);
      return;
    }
    const session = await migrateAgentSession(prev, nextKey);
    set({ activeKey: nextKey, session });
  },
}));

export function getActiveAgentSession(): AgentSession {
  return useAgentStore.getState().session;
}

/** 导出兼容：当前标签压成 v1 线程；完整多标签请用 getActiveAgentSession */
export function getActiveAgentThread(): AgentThread {
  const session = getActiveAgentSession();
  const chat = activeChatOf(session);
  return {
    version: 1,
    messages: chat.messages,
    updatedAt: session.updatedAt,
  };
}

export function getActiveAgentChat(): AgentChat {
  return activeChatOf(useAgentStore.getState().session);
}
