const chatService = require('../services/chat.service');
const Chat = require('../models/chat.model');

const handleChat = async (req, res) => {
    try{
        const userId = req.user?._id || null;
        const {message, history, metadata, sessionId, attachments} = req.body;

        const answer = await chatService.handleChat({
            userId, 
            message,
            history,
            metadata,
            sessionId,
            attachments,
        });
        
        res.json({answer});
    } catch (error) {
        console.error('Chat error: ', error);
        res.status(500).json({ 
            message: error.message || "Chat error",
        });
    }
};

const writeStreamEvent = (res, event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
};

const handleChatStream = async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.socket && typeof res.socket.setNoDelay === 'function') res.socket.setNoDelay(true);
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    writeStreamEvent(res, { type: 'ready' });

    try {
        const userId = req.user?._id || null;
        const {message, history, metadata, sessionId, attachments} = req.body;

        const result = await chatService.handleChatStream({
            userId,
            message,
            history,
            metadata,
            sessionId,
            attachments,
            onToken: (content) => writeStreamEvent(res, { type: 'token', content }),
        });

        writeStreamEvent(res, { type: 'done', answer: result.answer, plainText: result.plainText });
        res.end();
    } catch (error) {
        console.error('Chat stream error: ', error);
        writeStreamEvent(res, { type: 'error', message: error.message || 'Chat stream error' });
        res.end();
    }
};

// Lấy lịch sử chat của user
const getChatHistory = async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const { sessionId } = req.query;
        const { limit = 10 } = req.query;

        if (!userId && !sessionId) {
            return res.status(400).json({ message: 'userId or sessionId is required' });
        }

        const query = {};
        if (userId) {
            query.userId = userId;
        } else if (sessionId) {
            query.sessionId = sessionId;
        }

        const chats = await Chat.find(query)
            .sort({ updatedAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json({ chats });
    } catch (error) {
        console.error('Get chat history error: ', error);
        res.status(500).json({ 
            message: error.message || "Get chat history error",
        });
    }
};

// Xóa lịch sử chat
const clearChatHistory = async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const { sessionId } = req.body;

        if (!userId && !sessionId) {
            return res.status(400).json({ message: 'userId or sessionId is required' });
        }

        const query = {};
        if (userId) {
            query.userId = userId;
        } else if (sessionId) {
            query.sessionId = sessionId;
        }

        await Chat.updateMany(query, { isActive: false });

        res.json({ message: 'Chat history cleared successfully' });
    } catch (error) {
        console.error('Clear chat history error: ', error);
        res.status(500).json({ 
            message: error.message || "Clear chat history error",
        });
    }
};

module.exports = {handleChat, handleChatStream, getChatHistory, clearChatHistory};
