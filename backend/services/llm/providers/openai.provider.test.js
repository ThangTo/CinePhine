const test = require('node:test');
const assert = require('node:assert/strict');

const OpenAICompatibleProvider = require('./openai.provider');

test('OpenAI provider builds chat completions URL', () => {
  const provider = new OpenAICompatibleProvider('openai');
  const url = provider.buildUrl(
    { baseUrl: 'https://api.openai.com/v1', endpointPath: '/chat/completions' },
    'gpt-4o',
  );
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
});

test('OpenAI provider builds body with model and payload', () => {
  const provider = new OpenAICompatibleProvider('openai');
  const body = provider.buildBody(
    { messages: [{ role: 'user', content: 'hi' }] },
    'gpt-4o',
  );
  assert.equal(body.model, 'gpt-4o');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});

test('OpenAI provider preserves vision image_url message parts', () => {
  const provider = new OpenAICompatibleProvider('compatible');
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ],
  }];

  const body = provider.buildBody({ messages }, 'vision-model');

  assert.equal(body.model, 'vision-model');
  assert.deepEqual(body.messages, messages);
});

test('OpenAI provider builds Bearer auth header', () => {
  const provider = new OpenAICompatibleProvider('openai');
  const headers = provider.buildHeaders({ apiKey: 'sk-test' });
  assert.equal(headers.Authorization, 'Bearer sk-test');
});

test('OpenAI provider parses response content', () => {
  const provider = new OpenAICompatibleProvider('openai');
  const result = provider.parseResponse({
    choices: [{ message: { content: 'hello', tool_calls: [] } }],
    usage: { prompt_tokens: 10 },
  });
  assert.equal(result.content, 'hello');
  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.usage.prompt_tokens, 10);
});

test('OpenAI provider parses array content parts', () => {
  const provider = new OpenAICompatibleProvider('openai');
  const result = provider.parseResponse({
    choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }],
  });
  assert.equal(result.content, 'ab');
});

test('openrouter provider includes HTTP-Referer and X-Title', () => {
  const provider = new OpenAICompatibleProvider('openrouter');
  const headers = provider.buildHeaders({
    apiKey: 'key',
    headers: { 'HTTP-Referer': 'https://cinephine.io.vn', 'X-Title': 'CinePhine' },
  });
  assert.equal(headers['HTTP-Referer'], 'https://cinephine.io.vn');
  assert.equal(headers['X-Title'], 'CinePhine');
  assert.equal(headers.Authorization, 'Bearer key');
});

test('non-openrouter provider does not include HTTP-Referer', () => {
  const provider = new OpenAICompatibleProvider('openai');
  const headers = provider.buildHeaders({
    apiKey: 'key',
    headers: { 'HTTP-Referer': 'https://example.com', 'X-Title': 'Test' },
  });
  assert.equal(headers['HTTP-Referer'], undefined);
  assert.equal(headers['X-Title'], undefined);
});

test('chat() calls transport.post and returns normalized result', async () => {
  const provider = new OpenAICompatibleProvider('compatible');
  const calls = [];
  const transport = {
    post: async (url, body, opts) => {
      calls.push({ url, body, opts });
      return {
        data: {
          choices: [{ message: { content: 'ok', tool_calls: [] } }],
          usage: { prompt_tokens: 5 },
        },
      };
    },
  };

  const result = await provider.chat({
    payload: { messages: [{ role: 'user', content: 'hi' }] },
    config: { baseUrl: 'https://api.example.com/v1', apiKey: 'k', timeoutMs: 5000, headers: {} },
    model: 'model-a',
    transport,
  });

  assert.equal(result.content, 'ok');
  assert.equal(result.provider, 'compatible');
  assert.equal(result.model, 'model-a');
  assert.ok(result.durationMs >= 0);
  assert.equal(calls.length, 1);
});

test('chat() throws createLlmError on transport failure', async () => {
  const provider = new OpenAICompatibleProvider('compatible');
  const transport = {
    post: async () => {
      const err = new Error('network');
      err.response = { status: 500, data: { error: { message: 'down' } } };
      throw err;
    },
  };

  await assert.rejects(
    () => provider.chat({
      payload: { messages: [] },
      config: { baseUrl: 'https://api.example.com/v1', apiKey: 'k', timeoutMs: 5000, headers: {} },
      model: 'm',
      transport,
    }),
    (err) => {
      assert.equal(err.provider, 'compatible');
      assert.equal(err.model, 'm');
      assert.equal(err.status, 500);
      return true;
    },
  );
});

test('streamChat() parses OpenAI-compatible SSE token chunks', async () => {
  const provider = new OpenAICompatibleProvider('compatible');
  const calls = [];
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Xin "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"chao"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  const transport = {
    post: async (url, body, opts) => {
      calls.push({ url, body, opts });
      return { data: chunks };
    },
  };

  const tokens = [];
  const result = await provider.streamChat({
    payload: { messages: [{ role: 'user', content: 'hi' }] },
    config: { baseUrl: 'https://api.example.com/v1', apiKey: 'k', timeoutMs: 5000, headers: {} },
    model: 'model-a',
    transport,
    onToken: (token) => tokens.push(token),
  });

  assert.deepEqual(tokens, ['Xin ', 'chao']);
  assert.equal(result.content, 'Xin chao');
  assert.equal(result.provider, 'compatible');
  assert.equal(result.model, 'model-a');
  assert.equal(calls[0].body.stream, true);
  assert.equal(calls[0].opts.responseType, 'stream');
});
