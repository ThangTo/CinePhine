// CinePhine chat agent. History comes from the DB session, never from the client.
// Flow: complete() with tools -> run tool calls in parallel -> stream the final answer.
const Chat = require('../../models/chat.model');
const llm = require('../llm');
const { buildSystemPrompt } = require('./prompt');
const { TOOLS, executeTool, loadUserProfile, loadCurrentMovie } = require('./tools');

const MAX_MESSAGE_CHARS = 2000;
const HISTORY_MESSAGES = 12;
const MAX_TOOL_CALLS = 4;
const MAX_MOVIES = 8;
const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IMAGE_ONLY_TEXT = 'Gửi một ảnh';
const IMAGE_ONLY_PROMPT = 'Hãy mô tả ảnh này và trả lời theo ngữ cảnh CinePhine nếu ảnh liên quan đến phim.';
const FALLBACK_ANSWER =
  'Hiện tại hệ thống trợ lý AI đang quá tải hoặc gặp sự cố tạm thời. Bạn thử lại sau ít phút, hoặc dùng thanh tìm kiếm trên CinePhine nhé.';
const STATUS_TEXT = {
  search_movies: 'Đang tìm phim...',
  get_movie_details: 'Đang xem thông tin phim...',
  recommend_movies: 'Đang chọn phim hợp gu bạn...',
  get_my_library: 'Đang xem thư viện của bạn...',
  add_to_watchlist: 'Đang thêm vào danh sách xem sau...',
  open_movie: 'Đang mở phim...',
  update_memory: 'Đang ghi nhớ sở thích của bạn...',
};

function normalizeImageAttachmentData(data) {
  const value = String(data || '').trim();
  if (!value) throw new Error('Image attachment data is required');

  const base64 = value.includes(',') ? value.split(',').pop().trim() : value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error('Invalid image attachment data');
  }

  const decoded = Buffer.from(base64, 'base64');
  if (decoded.length === 0) throw new Error('Invalid image attachment data');
  if (decoded.length > MAX_IMAGE_ATTACHMENT_BYTES) throw new Error('Image attachment exceeds 5MB limit');
  return base64;
}

function normalizeChatAttachments(attachments = []) {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) throw new Error('Chat attachments must be an array');
  if (attachments.length > 1) throw new Error('Only one image attachment is supported');

  return attachments.map((attachment) => {
    const type = attachment?.type || 'image';
    if (type !== 'image') throw new Error(`Unsupported attachment type: ${type}`);
    const mimeType = String(attachment?.mime_type || attachment?.mimeType || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) throw new Error(`Unsupported image type: ${mimeType || 'unknown'}`);
    return { type: 'image', mime_type: mimeType, data: normalizeImageAttachmentData(attachment?.data) };
  });
}

function buildUserContent(text, attachments) {
  if (!attachments.length) return text;
  return [
    { type: 'text', text },
    ...attachments.map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mime_type};base64,${a.data}` } })),
  ];
}

const parseArgs = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

// llmStream may return an async iterator, call onToken, or resolve to { content }.
// Nothing streamed + error -> fall back to complete(). Partial stream + error -> keep the partial.
async function streamAnswer({ messages, onToken, llmStream, llmComplete }) {
  let streamed = '';
  const emit = (token) => {
    if (!token) return;
    streamed += token;
    onToken(token);
  };
  try {
    const result = llmStream({ scope: 'CHATBOT', messages, temperature: 0.6, onToken: emit });
    if (result && typeof result[Symbol.asyncIterator] === 'function') {
      for await (const chunk of result) emit(typeof chunk === 'string' ? chunk : chunk?.content);
    } else {
      const resolved = await result;
      if (!streamed) emit(resolved?.content);
    }
  } catch (error) {
    if (!streamed) {
      const resolved = await llmComplete({ scope: 'CHATBOT', messages, temperature: 0.6 });
      emit(resolved?.content);
    } else {
      console.error('[chat] stream broke mid-answer:', error.message);
    }
  }
  return streamed;
}

async function runTools(calls, { userId, toolDeps, onEvent }) {
  return Promise.all(
    calls.map(async (call) => {
      const name = call.function?.name;
      onEvent({ type: 'status', text: STATUS_TEXT[name] || 'Đang xử lý...' });
      const out = await executeTool(name, parseArgs(call.function?.arguments), { userId, deps: toolDeps });
      return { call, out };
    }),
  );
}

function collectUiPayload(results) {
  const seen = new Set();
  const movies = results
    .flatMap(({ out }) => out.movies || [])
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .slice(0, MAX_MOVIES);
  const actions = results.map(({ out }) => out.action).filter(Boolean);
  return { movies, actions };
}

/**
 * Runs one chat turn. onEvent receives { type: 'status'|'movies'|'action'|'token', ... }.
 * deps are injectable for tests.
 * @returns {Promise<{answer: string, movies: object[], actions: object[]}>}
 */
async function runAgent({ userId = null, message, metadata = {}, sessionId, attachments, onEvent = () => {}, deps = {} }) {
  const {
    chatModel = Chat,
    llmComplete = llm.complete,
    llmStream = llm.stream,
    loadProfile = loadUserProfile,
    loadMovie = loadCurrentMovie,
    toolDeps,
  } = deps;

  const files = normalizeChatAttachments(attachments);
  let userText = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!userText && !files.length) throw new Error('Message is required');
  if (!userText) userText = IMAGE_ONLY_TEXT;
  const promptText = files.length && userText === IMAGE_ONLY_TEXT ? IMAGE_ONLY_PROMPT : userText;

  const [session, profile, currentMovie] = await Promise.all([
    chatModel.findOrCreateSession({ userId, sessionId }).catch((error) => {
      console.error('[chat] load session failed:', error.message);
      return null;
    }),
    loadProfile(userId),
    loadMovie(metadata?.movieId),
  ]);

  const history = (session?.messages || []).slice(-HISTORY_MESSAGES).map(({ role, content }) => ({ role, content }));
  const page = String(metadata?.page || '').replace(/[^\w\-/.]/g, '').slice(0, 120);
  const messages = [
    { role: 'system', content: buildSystemPrompt({ profile, page, currentMovie }) },
    ...history,
    { role: 'user', content: buildUserContent(promptText, files) },
  ];

  const onToken = (content) => onEvent({ type: 'token', content });
  let answer = '';
  let ui = { movies: [], actions: [] };
  try {
    const first = await llmComplete({ scope: 'CHATBOT', messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.4 });
    const calls = (first.toolCalls || []).slice(0, MAX_TOOL_CALLS);

    if (!calls.length) {
      answer = (first.content || '').trim();
      if (answer) onToken(answer);
    } else {
      // ponytail: one tool round, then a streamed answer; add a loop when a tool needs another tool's output.
      const results = await runTools(calls, { userId, toolDeps, onEvent });
      ui = collectUiPayload(results);
      if (ui.movies.length) onEvent({ type: 'movies', movies: ui.movies });
      ui.actions.forEach((action) => onEvent({ type: 'action', action }));

      answer = await streamAnswer({
        messages: [
          ...messages,
          // Non-empty content: the Gemini provider drops tool_calls and an empty turn breaks it.
          { role: 'assistant', content: first.content || 'Đang tra cứu dữ liệu.', tool_calls: calls },
          ...results.map(({ call, out }) => ({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.result) })),
        ],
        onToken,
        llmStream,
        llmComplete,
      });
    }
  } catch (error) {
    console.error('[chat] agent failed:', error.message);
  }

  if (!answer.trim()) {
    answer = FALLBACK_ANSWER;
    onToken(answer);
  }

  if (session) {
    try {
      await session.addMessage('user', userText);
      await session.addMessage('assistant', answer);
    } catch (error) {
      console.error('[chat] save messages failed:', error.message);
    }
  }

  return { answer, ...ui };
}

module.exports = { runAgent };
