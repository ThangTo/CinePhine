const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    // User ID - null nếu guest user
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    // Session ID cho guest users (dựa vào IP hoặc browser fingerprint)
    sessionId: {
      type: String,
      index: true,
    },
    // Lịch sử tin nhắn
    messages: [messageSchema],
    // Metadata của cuộc hội thoại
    metadata: {
      movieId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Movie',
      },
      userAgent: String,
      ipAddress: String,
    },
    // Trạng thái cuộc hội thoại
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Index để tìm kiếm nhanh theo userId hoặc sessionId
chatSchema.index({ userId: 1, createdAt: -1 });
chatSchema.index({ sessionId: 1, createdAt: -1 });
chatSchema.index({ updatedAt: -1 });

// Virtual để lấy số tin nhắn
chatSchema.virtual('messageCount').get(function () {
  return this.messages.length;
});

// Method để thêm tin nhắn mới
const MAX_STORED_MESSAGES = 50;

chatSchema.methods.addMessage = function (role, content) {
  this.messages.push({ role, content, timestamp: new Date() });
  if (this.messages.length > MAX_STORED_MESSAGES) {
    this.messages.splice(0, this.messages.length - MAX_STORED_MESSAGES);
  }
  return this.save();
};

// Static method để tìm hoặc tạo chat session
chatSchema.statics.findOrCreateSession = async function ({ userId, sessionId }) {
  // Logged-in users own their chats by userId; guests only see guest chats, so a shared
  // browser sessionId never exposes or continues an account's conversation.
  const owner = userId ? { userId } : sessionId ? { sessionId, userId: null } : null;
  let chat = owner
    ? await this.findOne({ ...owner, isActive: true }).sort({ updatedAt: -1 })
    : null;

  if (!chat) {
    chat = await this.create({
      userId,
      sessionId,
      messages: [],
      isActive: true,
    });
  }

  return chat;
};

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;
