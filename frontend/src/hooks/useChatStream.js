import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api/v1";
const SESSION_KEY = "chatbot_sessionId";

export const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant",
  content:
    "Xin chào! 👋 Tôi là trợ lý AI của CinePhine.\nTôi có thể tìm phim, gợi ý theo gu của bạn, mở phim hoặc thêm vào danh sách xem sau.\n\nBạn muốn xem gì hôm nay?",
};

const createSessionId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = createSessionId();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

function ensureSessionId(ref) {
  if (!ref.current) ref.current = getSessionId();
  return ref.current;
}

/** Reads an SSE body and calls onEvent with each parsed `data:` JSON frame. */
export async function readEventStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (frame) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (data) onEvent(JSON.parse(data));
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    frames.forEach(emit);
  }
  if (buffer.trim()) emit(buffer);
}

async function readErrorMessage(res) {
  const data = await res.json().catch(() => null);
  // Rate limiters answer with { error }, controllers with { message }.
  return data?.message || data?.error || `Không kết nối được trợ lý AI (${res.status})`;
}

/**
 * Chat state + SSE transport. onAction receives server actions such as { type: "navigate", path }.
 * Events: ready, status {text}, movies {movies}, action {action}, token {content}, done {answer, movies}, error {message}.
 */
export default function useChatStream({ onAction, active = true } = {}) {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [isSending, setIsSending] = useState(false);
  const sessionIdRef = useRef(null);
  const abortRef = useRef(null);
  const restoredRef = useRef(false);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const patchMessage = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, ...(typeof patch === "function" ? patch(msg) : patch) } : msg))
    );
  }, []);

  // Restore the active conversation the first time the chat opens
  // (logged-in users by account, guests by sessionId).
  useEffect(() => {
    if (!active || restoredRef.current) return;
    restoredRef.current = true;
    const requestedSessionId = ensureSessionId(sessionIdRef);
    const query = `sessionId=${encodeURIComponent(requestedSessionId)}&limit=1&active=true`;
    fetch(`${API_BASE_URL}/chat/history?${query}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const saved = data?.chats?.[0]?.messages || [];
        if (!saved.length || sessionIdRef.current !== requestedSessionId) return;
        const restored = saved.map((msg, index) => ({ id: `history_${index}`, role: msg.role, content: msg.content }));
        // Do not clobber a conversation the user already started while this was loading.
        setMessages((prev) => (prev.length === 1 ? [WELCOME_MESSAGE, ...restored] : prev));
      })
      .catch((error) => console.error("Chat history restore failed:", error));
  }, [active]);

  const send = useCallback(
    async ({ text = "", file = null, metadata = {} }) => {
      if (abortRef.current || (!text && !file)) return;

      const stamp = Date.now();
      const botId = `assistant_${stamp}`;
      setMessages((prev) => [
        ...prev,
        { id: `user_${stamp}`, role: "user", content: text || "Gửi một ảnh", file },
        { id: botId, role: "assistant", content: "", pending: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsSending(true);

      const handleEvent = (event) => {
        if (event.type === "status") patchMessage(botId, { status: event.text });
        else if (event.type === "movies") patchMessage(botId, { movies: event.movies });
        else if (event.type === "action") onActionRef.current?.(event.action);
        else if (event.type === "suggestions") patchMessage(botId, { suggestions: event.options });
        else if (event.type === "token") patchMessage(botId, (msg) => ({ content: msg.content + (event.content || ""), status: null }));
        else if (event.type === "done")
          patchMessage(botId, (msg) => ({ content: event.answer || msg.content, movies: event.movies?.length ? event.movies : msg.movies }));
        else if (event.type === "error") throw new Error(event.message);
      };

      try {
        const res = await fetch(`${API_BASE_URL}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            metadata,
            sessionId: ensureSessionId(sessionIdRef),
            ...(file ? { attachments: [{ type: "image", mime_type: file.mime_type, data: file.data }] } : {}),
          }),
        });
        if (!res.ok || !res.body) throw new Error(await readErrorMessage(res));
        await readEventStream(res.body, handleEvent);
      } catch (error) {
        if (error.name === "AbortError") {
          patchMessage(botId, (msg) => ({ content: msg.content || "Đã dừng trả lời." }));
        } else {
          // fetch() rejects with a TypeError ("Failed to fetch") when the API is unreachable.
          const offline = error instanceof TypeError;
          patchMessage(botId, {
            error: offline ? "Không kết nối được trợ lý AI, vui lòng thử lại." : error.message || "Trợ lý AI đang gặp sự cố, vui lòng thử lại.",
          });
        }
      } finally {
        // ponytail: stop only cuts the client stream; the server still finishes and saves the turn.
        patchMessage(botId, { pending: false, status: null });
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsSending(false);
        }
      }
    },
    [patchMessage]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Deactivates the old conversation server-side; input stays locked until that lands,
  // otherwise a logged-in user's next message would reopen the old session.
  const reset = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const previousSessionId = ensureSessionId(sessionIdRef);
    sessionIdRef.current = createSessionId();
    localStorage.setItem(SESSION_KEY, sessionIdRef.current);
    setMessages([WELCOME_MESSAGE]);
    setIsSending(true);
    try {
      await fetch(`${API_BASE_URL}/chat/history`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId: previousSessionId }),
      });
    } catch (error) {
      console.error("Chat history clear failed:", error);
    } finally {
      setIsSending(false);
    }
  }, []);

  return { messages, isSending, send, stop, reset };
}
