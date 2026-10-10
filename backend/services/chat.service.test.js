const test = require('node:test');
const assert = require('node:assert/strict');

const { handleChatStream } = require('./chat.service');

test('handleChatStream streams tokens, returns formatted answer, and saves history', async () => {
  const emitted = [];
  const saved = [];
  const fakeChat = {
    messages: [],
    addMessage: async (role, content) => {
      saved.push({ role, content });
    },
    save: async () => {},
  };
  const fakeChatModel = {
    findOrCreateSession: async () => fakeChat,
  };

  const result = await handleChatStream({
    userId: null,
    message: 'Xin chao',
    history: [],
    metadata: { page: '/' },
    sessionId: 'session-a',
    onToken: (token) => emitted.push(token),
    chatModel: fakeChatModel,
    llmStream: async function* () {
      yield { content: 'Xin ' };
      yield { content: 'chao' };
    },
  });

  assert.deepEqual(emitted, ['Xin ', 'chao']);
  assert.match(result.answer, /Xin chao/);
  assert.equal(result.plainText, 'Xin chao');
  assert.deepEqual(saved, [
    { role: 'user', content: 'Xin chao' },
    { role: 'assistant', content: 'Xin chao' },
  ]);
});

test('handleChatStream sends image attachments as OpenAI-compatible vision parts', async () => {
  let capturedMessages = null;
  let classifierArgs = null;
  const fakeChat = {
    messages: [],
    addMessage: async () => {},
    save: async () => {},
  };
  const fakeChatModel = {
    findOrCreateSession: async () => fakeChat,
  };

  const result = await handleChatStream({
    userId: null,
    message: 'Tôi đang xem một ảnh poster phim, hãy phân tích và gợi ý nội dung phim tương tự top hay nhất',
    history: [{ role: 'user', content: 'Trước đó tôi hỏi phim hành động' }],
    metadata: { page: '/' },
    sessionId: 'session-vision',
    attachments: [{
      type: 'image',
      mime_type: 'image/png',
      data: Buffer.from('fake image').toString('base64'),
    }],
    onToken: () => {},
    chatModel: fakeChatModel,
    classifyIntent: async (...args) => {
      classifierArgs = args;
      return { intent: 'general', queryType: 'other' };
    },
    buildDbContext: async () => ({ note: 'test context' }),
    llmStream: async ({ messages }) => {
      capturedMessages = messages;
      return { content: 'Đây là một ảnh poster phim.' };
    },
  });

  assert.equal(result.plainText, 'Đây là một ảnh poster phim.');
  assert.deepEqual(classifierArgs, ['Tôi đang xem một ảnh poster phim, hãy phân tích và gợi ý nội dung phim tương tự top hay nhất']);
  const lastMessage = capturedMessages.at(-1);
  assert.equal(lastMessage.role, 'user');
  assert.equal(lastMessage.content[0].type, 'text');
  assert.match(lastMessage.content[0].text, /poster phim/);
  assert.deepEqual(lastMessage.content[1], {
    type: 'image_url',
    image_url: {
      url: `data:image/png;base64,${Buffer.from('fake image').toString('base64')}`,
    },
  });
});

test('handleChatStream supports image-only messages with default vision prompt', async () => {
  let capturedMessages = null;
  const fakeChatModel = {
    findOrCreateSession: async () => ({
      messages: [],
      addMessage: async () => {},
      save: async () => {},
    }),
  };

  await handleChatStream({
    userId: null,
    message: 'Gửi một ảnh',
    history: [],
    metadata: {},
    sessionId: 'session-image-only',
    attachments: [{
      type: 'image',
      mime_type: 'image/jpeg',
      data: Buffer.from('jpeg').toString('base64'),
    }],
    onToken: () => {},
    chatModel: fakeChatModel,
    classifyIntent: async () => ({ intent: 'general' }),
    buildDbContext: async () => ({ note: 'test context' }),
    llmStream: async ({ messages }) => {
      capturedMessages = messages;
      return { content: 'Ảnh hợp lệ.' };
    },
  });

  const lastMessage = capturedMessages.at(-1);
  assert.equal(lastMessage.content[0].type, 'text');
  assert.match(lastMessage.content[0].text, /mô tả ảnh/i);
  assert.equal(lastMessage.content[1].image_url.url.startsWith('data:image/jpeg;base64,'), true);
});

test('handleChatStream rejects unsupported image attachments', async () => {
  const fakeChatModel = {
    findOrCreateSession: async () => ({
      messages: [],
      addMessage: async () => {},
      save: async () => {},
    }),
  };

  await assert.rejects(
    () => handleChatStream({
      userId: null,
      message: 'test',
      history: [],
      metadata: {},
      sessionId: 'session-invalid',
      attachments: [{ type: 'image', mime_type: 'image/svg+xml', data: 'abc' }],
      onToken: () => {},
    chatModel: fakeChatModel,
    classifyIntent: async () => ({ intent: 'general' }),
      buildDbContext: async () => ({ note: 'test context' }),
      llmStream: async () => ({ content: 'nope' }),
    }),
    /Unsupported image type/,
  );
});

test('handleChatStream rejects image attachments larger than 5MB', async () => {
  const fakeChatModel = {
    findOrCreateSession: async () => ({
      messages: [],
      addMessage: async () => {},
      save: async () => {},
    }),
  };
  const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');

  await assert.rejects(
    () => handleChatStream({
      userId: null,
      message: 'test',
      history: [],
      metadata: {},
      sessionId: 'session-large',
      attachments: [{ type: 'image', mime_type: 'image/png', data: tooLarge }],
      onToken: () => {},
      chatModel: fakeChatModel,
      classifyIntent: async () => ({ intent: 'general' }),
      buildDbContext: async () => ({ note: 'test context' }),
      llmStream: async () => ({ content: 'nope' }),
    }),
    /exceeds 5MB/,
  );
});
