const { runAgent } = require('../services/chat');
const Chat = require('../models/chat.model');

const MAX_HISTORY_LIMIT = 50;

const isClientError = (error) => /attachment|image type|Message is required/i.test(error.message || '');

const getChatInput = (req) => {
    const { message, metadata, sessionId, attachments } = req.body || {};
    return {
        userId: req.user?._id || null,
        message,
        metadata: metadata || {},
        sessionId: typeof sessionId === 'string' ? sessionId.slice(0, 100) : undefined,
        attachments,
    };
};

const handleChat = async (req, res) => {
    try {
        const { answer, movies, actions } = await runAgent(getChatInput(req));
        res.json({ answer, movies, actions });
    } catch (error) {
        console.error('Chat error: ', error);
        res.status(isClientError(error) ? 400 : 500).json({
            message: isClientError(error) ? error.message : 'Chat error',
        });
    }
};

const writeStreamEvent = (res, event) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
};

// SSE events: ready, status {text}, movies {movies}, action {action}, token {content},
// done {answer, movies, actions}, error {message}.
const handleChatStream = async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.socket && typeof res.socket.setNoDelay === 'function') res.socket.setNoDelay(true);
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    writeStreamEvent(res, { type: 'ready' });

    try {
        const result = await runAgent({
            ...getChatInput(req),
            onEvent: (event) => writeStreamEvent(res, event),
        });
        writeStreamEvent(res, { type: 'done', ...result });
    } catch (error) {
        console.error('Chat stream error: ', error);
        writeStreamEvent(res, {
            type: 'error',
            message: isClientError(error) ? error.message : 'Trợ lý AI đang gặp sự cố, vui lòng thử lại.',
        });
    }
    if (!res.writableEnded) res.end();
};

const getHistoryQuery = (req, sessionId) => {
    const userId = req.user?._id || null;
    if (userId) return { userId };
    // Guests must never reach an account's chat through a reused browser sessionId.
    if (typeof sessionId === 'string' && sessionId) return { sessionId, userId: null };
    return null;
};

// Lấy lịch sử chat của user
const getChatHistory = async (req, res) => {
    try {
        const query = getHistoryQuery(req, req.query.sessionId);
        if (!query) {
            return res.status(400).json({ message: 'userId or sessionId is required' });
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), MAX_HISTORY_LIMIT);
        const activeOnly = req.query.active === 'true' ? { isActive: true } : {};
        const chats = await Chat.find({ ...query, ...activeOnly })
            .select('messages isActive createdAt updatedAt')
            .sort({ updatedAt: -1 })
            .limit(limit)
            .lean();

        res.json({ chats });
    } catch (error) {
        console.error('Get chat history error: ', error);
        res.status(500).json({ message: 'Get chat history error' });
    }
};

// Xóa lịch sử chat
const clearChatHistory = async (req, res) => {
    try {
        const query = getHistoryQuery(req, req.body?.sessionId);
        if (!query) {
            return res.status(400).json({ message: 'userId or sessionId is required' });
        }

        await Chat.updateMany(query, { isActive: false });

        res.json({ message: 'Chat history cleared successfully' });
    } catch (error) {
        console.error('Clear chat history error: ', error);
        res.status(500).json({ message: 'Clear chat history error' });
    }
};

module.exports = {handleChat, handleChatStream, getChatHistory, clearChatHistory};
