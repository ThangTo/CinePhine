const { complete } = require('../services/llm');
const Movie = require('../models/movie.model');
const UserFavorite = require('../models/user_favorite.model');
const Comment = require('../models/comment.model');
const mongoose = require('mongoose');
const { generateTtsAudio } = require('../utils/ttsUtils');
const movieService = require('../services/movie.service');

// ====================================================================
// TOOLS DEFINITION
// ====================================================================
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'control_player',
      description: 'Điều khiển trình phát: PLAY, PAUSE, NEXT_EP, FULLSCREEN, VOLUME_UP, VOLUME_DOWN, MUTE, UNMUTE.',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'Hành động điều khiển: Mở phim/Tạm dừng/Phát lại/Qua tập...',
                enum: ['PLAY', 'PAUSE', 'NEXT_EPISODE', 'PREV_EPISODE', 'MUTE', 'UNMUTE', 'VOLUME_UP', 'VOLUME_DOWN', 'MAX_VOLUME', 'FULLSCREEN', 'CHANGE_EPISODE', 'CHANGE_AUDIO']
              },
              episode_number: {
                type: 'number',
                description: 'Bắt buộc nếu action là CHANGE_EPISODE. Chọn tập phim mà người dùng muốn chuyển đến (vd: 3)'
              },
              audio_type: {
                type: 'string',
                description: 'Bắt buộc nếu action là CHANGE_AUDIO. Chọn kiểu âm thanh: vietsub, thuyet-minh, long-tieng',
                enum: ['vietsub', 'thuyet-minh', 'long-tieng']
              }
            },
            required: ['action']
          },
    },
  },
  {
    type: 'function',
    function: {
      name: 'seek_video',
      description: 'Tua video tiến/lùi theo số giây, HOẶC nhảy tới vị trí cụ thể (giữa phim, cuối phim, đầu phim). Nếu người dùng nói "tua tới giữa phim" thì dùng position=MIDDLE, "cuối phim" thì position=END.',
      parameters: {
        type: 'object',
        properties: {
          seconds: { type: 'number', description: 'Số giây tua tiến (+) hoặc lùi (-). Bỏ qua nếu dùng position.' },
          position: { type: 'string', enum: ['BEGINNING', 'MIDDLE', 'END'], description: 'Vị trí nhảy tới. BEGINNING=đầu phim, MIDDLE=giữa phim, END=gần cuối phim (90%).' }
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Chuyển trang: HOME, SEARCH, PROFILE.',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string', enum: ['HOME', 'SEARCH', 'PROFILE'] },
          search_query: { type: 'string' },
        },
        required: ['destination'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll_page',
      description: 'Cuộn / trượt trang web lên hoặc xuống.',
      parameters: {
        type: 'object',
        properties: { direction: { type: 'string', enum: ['UP', 'DOWN'] } },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'play_specific_movie',
      description: 'Mở/Phát một bộ phim CỤ THỂ theo tên. Có thể kèm tập và kiểu âm thanh nếu người dùng yêu cầu (vd: "mở tập 10 lồng tiếng phim Trục Ngọc").',
      parameters: {
        type: 'object',
        properties: {
          movie_name: { type: 'string', description: 'Tên bộ phim người dùng muốn xem' },
          episode_number: { type: 'number', description: 'Số tập muốn xem (optional, mặc định tập 1)' },
          audio_type: { type: 'string', enum: ['vietsub', 'thuyet-minh', 'long-tieng'], description: 'Kiểu âm thanh (optional)' }
        },
        required: ['movie_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'interact_current_movie',
      description: 'Tương tác với phim ĐANG XEM (thích/lưu phim, hoặc viết bình luận). CHỈ GỌI KHI ĐANG MỞ PHIM (is_video_playing hoặc URL là trang xem phim).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['FAVORITE', 'COMMENT'] },
          comment_text: { type: 'string', description: 'Nội dung bình luận nếu action là COMMENT' },
        },
        required: ['action'],
      },
    },
  },
];

const getSystemPrompt = (context, user) => `
Bạn là Timi, trợ lý giọng nói của CinePhine. Trả lời cực ngắn gọn (dưới 15 chữ), vui vẻ.
LUÔN GỌI TOOL để thao tác. Có thể gọi NỀU context phù hợp.

[CONTEXT HIỆN TẠI TỪ GIAO DIỆN NGƯỜI DÙNG]
- URL hiện tại: ${context?.current_path || 'Không rõ'}
- Đang phát video/Có phim trên màn hình: ${context?.is_video_playing ? 'CÓ' : 'KHÔNG'}
- Thời lượng video hiện tại (giây): ${context?.video_duration || 'Không rõ'}
- Trạng thái đăng nhập: ${user ? `ĐÃ ĐĂNG NHẬP (ID: ${user.id})` : 'CHƯA ĐĂNG NHẬP'}

[QUY TẮC CỨNG]
1. NẾU người dùng yêu cầu Tua (seek), Bật/Tắt (control_player) nhưng [CONTEXT] báo KHÔNG có video -> KHÔNG GỌI TOOL ĐÓ, chỉ nói "Bạn đang không xem phim nào!".
2. NẾU người dùng yêu cầu Bình luận hoặc Thích phim (interact_current_movie) nhưng CHƯA ĐĂNG NHẬP -> KHÔNG GỌI TOOL, chỉ nói "Bạn cần đăng nhập trước nhé!".
3. NẾU người dùng yêu cầu Thích/Bình luận mà KHÔNG PHẢI trang xem phim -> chỉ nói "Bạn cần mở một bộ phim để tương tác!".
4. LỖI NHẬN DIỆN GIỌNG NÓI: Đầu vào của người dùng là từ micro chuyển thành văn bản, nên THƯỜNG XUYÊN CÓ lỗi chính tả âm thanh/sai dấu. Ví dụ: "Dựng phim" hay "Dừng phin" = "Dừng phim" (PAUSE), "Bặc" hay "Bậc" = "Bật" (PLAY), "Tu đi" = "Tua đi" (SEEK_VIDEO). BẠN PHẢI TỰ ĐỘNG SỬA LỖI, thông cảm và ĐOÁN Ý ĐỊNH dựa theo ngữ cảnh xem phim. Tuyệt đối không từ chối ví dụ như "Tôi không hiểu dựng phim là gì", hãy tự hiểu đó là "Dừng phim" và gọi tool ngay lập tức!
5. BẮT BUỘC: KHÔNG BAO GIỜ được để trống câu trả lời. Luôn phải trả lời một câu ngắn gọn thân thiện như người thật. NÓI RÕ RÀNG bạn sắp làm gì.
6. KHI BÌNH LUẬN: Nếu người dùng nói "bình luận phim hay quá" hoặc câu tương tự, hãy gọi interact_current_movie với action=COMMENT và comment_text chính là nội dung người dùng muốn gửi (ví dụ: "Phim hay quá!"). KHÔNG BAO GIỜ hỏi lại "Bạn muốn bình luận gì?", hãy tự trích nội dung và gửi luôn!
7. KHI MỞ PHIM KÈM TẬP: Nếu người dùng nói "mở tập 10 lồng tiếng phim X", gọi play_specific_movie với movie_name, episode_number=10, audio_type="long-tieng".
`;

function normalizeVoiceText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getVoiceTokens(transcript) {
  const originalTokens = String(transcript || '').trim().split(/\s+/).filter(Boolean);
  const normalizedTokens = originalTokens.map((token) =>
    normalizeVoiceText(token).replace(/^[^\w-]+|[^\w-]+$/g, ''),
  );

  const leadingFillers = new Set(['timi', 'hey', 'oi', 'lam', 'on', 'giup', 'minh', 'hay', 'cho', 'toi', 'em']);
  let startIndex = 0;
  while (startIndex < normalizedTokens.length && leadingFillers.has(normalizedTokens[startIndex])) {
    startIndex += 1;
  }

  return {
    originalTokens: originalTokens.slice(startIndex),
    normalizedTokens: normalizedTokens.slice(startIndex),
  };
}

function startsWithTokens(tokens, pattern) {
  if (tokens.length < pattern.length) return false;
  return pattern.every((token, index) => tokens[index] === token);
}

function findPhraseIndex(tokens, pattern, startIndex = 0) {
  if (!pattern || pattern.length === 0 || tokens.length < pattern.length) return -1;

  for (let index = startIndex; index <= tokens.length - pattern.length; index += 1) {
    if (pattern.every((token, offset) => tokens[index + offset] === token)) {
      return index;
    }
  }

  return -1;
}

function hasPhrase(tokens, pattern) {
  return findPhraseIndex(tokens, pattern) !== -1;
}

function hasAnyPhrase(tokens, patterns) {
  return patterns.some((pattern) => hasPhrase(tokens, pattern));
}

function createControlToolCall(action, payload = {}) {
  return createDeterministicToolCall('control_player', { action, ...payload });
}

function cleanMovieQueryFromTokens(tokens) {
  let end = tokens.length;
  const trailingFillers = new Set(['di', 'nhe', 'nha', 'voi', 'a']);

  while (end > 0) {
    const normalized = normalizeVoiceText(tokens[end - 1]).replace(/^[^\w-]+|[^\w-]+$/g, '');
    if (!trailingFillers.has(normalized)) break;
    end -= 1;
  }

  return tokens
    .slice(0, end)
    .join(' ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .slice(0, 120);
}

function createDeterministicToolCall(name, args) {
  return {
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

function parseAudioHint(tokens, index) {
  if (tokens[index] === 'long' && tokens[index + 1] === 'tieng') {
    return { audioType: 'long-tieng', nextIndex: index + 2 };
  }

  if (tokens[index] === 'thuyet' && tokens[index + 1] === 'minh') {
    return { audioType: 'thuyet-minh', nextIndex: index + 2 };
  }

  if (tokens[index] === 'vietsub') {
    return { audioType: 'vietsub', nextIndex: index + 1 };
  }

  if (tokens[index] === 'phu' && tokens[index + 1] === 'de') {
    return { audioType: 'vietsub', nextIndex: index + 2 };
  }

  return { audioType: null, nextIndex: index };
}

function findAudioHint(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    const audioHint = parseAudioHint(tokens, index);
    if (audioHint.audioType) return audioHint.audioType;
  }

  return null;
}

function parseOpenMovieCommand(originalTokens, normalizedTokens, startIndex) {
  let index = startIndex;
  const args = {};

  if (normalizedTokens[index] === 'tap' && /^\d+$/.test(normalizedTokens[index + 1] || '')) {
    args.episode_number = Number(normalizedTokens[index + 1]);
    index += 2;
  }

  const audioHint = parseAudioHint(normalizedTokens, index);
  if (audioHint.audioType) {
    args.audio_type = audioHint.audioType;
    index = audioHint.nextIndex;
  }

  if (normalizedTokens[index] === 'phim') {
    index += 1;
  }

  const movieName = cleanMovieQueryFromTokens(originalTokens.slice(index));
  if (!movieName) return null;

  const normalizedMovieName = normalizeVoiceText(movieName);
  if (['tiep', 'len', 'di', 'nhe', 'nha', 'tieng', 'video'].includes(normalizedMovieName)) return null;

  return { movie_name: movieName, ...args };
}

function findCommandStart(normalizedTokens, patterns) {
  for (const pattern of patterns) {
    if (startsWithTokens(normalizedTokens, pattern)) {
      return pattern.length;
    }
  }
  return -1;
}

function parseNumberAt(tokens, index) {
  const token = tokens[index];
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);

  const simpleNumbers = {
    mot: 1,
    hai: 2,
    ba: 3,
    bon: 4,
    tu: 4,
    nam: 5,
    lam: 5,
    sau: 6,
    bay: 7,
    tam: 8,
    chin: 9,
    muoi: 10,
  };

  return simpleNumbers[token] || null;
}

function findEpisodeNumber(tokens) {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index] === 'tap') {
      const number = parseNumberAt(tokens, index + 1);
      if (number) return number;
    }
  }

  return null;
}

function parseDurationSeconds(tokens) {
  let total = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const number = parseNumberAt(tokens, index);
    if (!number) continue;

    const unit = tokens[index + 1];
    if (unit === 'phut' || unit === 'minute' || unit === 'minutes') {
      total += number * 60;
    } else if (unit === 'giay' || unit === 'second' || unit === 'seconds') {
      total += number;
    } else if (total === 0) {
      total += number;
    }
  }

  return total > 0 ? total : null;
}

function buildSeekToolCall(normalizedTokens) {
  const hasSeekIntent = hasAnyPhrase(normalizedTokens, [
    ['tua'],
    ['lui'],
    ['quay', 'lai'],
    ['ve', 'dau'],
    ['den', 'giua'],
    ['toi', 'giua'],
    ['den', 'cuoi'],
    ['toi', 'cuoi'],
  ]);

  if (!hasSeekIntent) return null;

  if (hasPhrase(normalizedTokens, ['giua', 'phim']) || hasPhrase(normalizedTokens, ['toi', 'giua']) || hasPhrase(normalizedTokens, ['den', 'giua'])) {
    return createDeterministicToolCall('seek_video', { position: 'MIDDLE' });
  }

  if (hasPhrase(normalizedTokens, ['cuoi', 'phim']) || hasPhrase(normalizedTokens, ['toi', 'cuoi']) || hasPhrase(normalizedTokens, ['den', 'cuoi'])) {
    return createDeterministicToolCall('seek_video', { position: 'END' });
  }

  if (hasPhrase(normalizedTokens, ['dau', 'phim']) || hasPhrase(normalizedTokens, ['ve', 'dau']) || hasPhrase(normalizedTokens, ['tu', 'dau'])) {
    return createDeterministicToolCall('seek_video', { position: 'BEGINNING' });
  }

  const durationSeconds = parseDurationSeconds(normalizedTokens);
  if (!durationSeconds) return null;

  const isBackward = hasAnyPhrase(normalizedTokens, [
    ['lui'],
    ['quay', 'lai'],
    ['tua', 'lai'],
    ['nguoc'],
  ]);

  return createDeterministicToolCall('seek_video', {
    seconds: isBackward ? -durationSeconds : durationSeconds,
  });
}

function buildDeterministicVoiceToolCalls(transcript) {
  const { originalTokens, normalizedTokens } = getVoiceTokens(transcript);
  if (normalizedTokens.length === 0) return [];

  const searchStart = findCommandStart(normalizedTokens, [
    ['tim', 'kiem', 'phim'],
    ['tim', 'phim'],
    ['tim', 'kiem'],
    ['search', 'phim'],
    ['search'],
    ['tim'],
  ]);

  if (searchStart !== -1) {
    const searchQuery = cleanMovieQueryFromTokens(originalTokens.slice(searchStart));
    if (!searchQuery) return [];
    return [createDeterministicToolCall('navigate', {
      destination: 'SEARCH',
      search_query: searchQuery,
    })];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['trang', 'chu'],
    ['ve', 'nha'],
    ['home'],
  ])) {
    return [createDeterministicToolCall('navigate', { destination: 'HOME' })];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['tai', 'khoan'],
    ['profile'],
    ['ho', 'so'],
    ['trang', 'ca', 'nhan'],
    ['ca', 'nhan'],
  ])) {
    return [createDeterministicToolCall('navigate', { destination: 'PROFILE' })];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['trang', 'tim', 'kiem'],
    ['mo', 'tim', 'kiem'],
    ['vao', 'tim', 'kiem'],
  ])) {
    return [createDeterministicToolCall('navigate', { destination: 'SEARCH', search_query: '' })];
  }

  const openStart = findCommandStart(normalizedTokens, [
    ['mo', 'phim'],
    ['phat', 'phim'],
    ['xem', 'phim'],
    ['coi', 'phim'],
    ['bat', 'phim'],
    ['mo'],
    ['phat'],
    ['xem'],
    ['coi'],
    ['bat'],
  ]);

  if (openStart !== -1) {
    const args = parseOpenMovieCommand(originalTokens, normalizedTokens, openStart);
    if (args) {
      return [createDeterministicToolCall('play_specific_movie', args)];
    }
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['thich', 'phim'],
    ['luu', 'phim'],
    ['yeu', 'thich', 'phim'],
    ['them', 'yeu', 'thich'],
    ['them', 'vao', 'yeu', 'thich'],
  ])) {
    return [createDeterministicToolCall('interact_current_movie', { action: 'FAVORITE' })];
  }

  const commentStart = findCommandStart(normalizedTokens, [
    ['binh', 'luan'],
    ['comment'],
  ]);

  if (commentStart !== -1) {
    const commentText = cleanMovieQueryFromTokens(originalTokens.slice(commentStart));
    return [createDeterministicToolCall('interact_current_movie', {
      action: 'COMMENT',
      ...(commentText ? { comment_text: commentText } : {}),
    })];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['tap', 'tiep'],
    ['tap', 'sau'],
    ['tap', 'ke'],
    ['tap', 'ke', 'tiep'],
    ['next', 'tap'],
    ['qua', 'tap'],
  ])) {
    return [createControlToolCall('NEXT_EPISODE')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['tap', 'truoc'],
    ['previous', 'tap'],
    ['prev', 'tap'],
    ['quay', 'lai', 'tap'],
  ])) {
    return [createControlToolCall('PREV_EPISODE')];
  }

  const episodeNumber = findEpisodeNumber(normalizedTokens);
  if (episodeNumber) {
    return [createControlToolCall('CHANGE_EPISODE', { episode_number: episodeNumber })];
  }

  const audioType = findAudioHint(normalizedTokens);
  if (audioType && hasAnyPhrase(normalizedTokens, [
    ['doi'],
    ['chuyen'],
    ['sang'],
    ['bat'],
    ['mo'],
  ])) {
    return [createControlToolCall('CHANGE_AUDIO', { audio_type: audioType })];
  }

  const seekToolCall = buildSeekToolCall(normalizedTokens);
  if (seekToolCall) return [seekToolCall];

  if (hasAnyPhrase(normalizedTokens, [
    ['cuon', 'xuong'],
    ['luot', 'xuong'],
    ['truot', 'xuong'],
    ['keo', 'xuong'],
    ['scroll', 'down'],
    ['xuong', 'duoi'],
  ])) {
    return [createDeterministicToolCall('scroll_page', { direction: 'DOWN' })];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['cuon', 'len'],
    ['luot', 'len'],
    ['truot', 'len'],
    ['keo', 'len'],
    ['scroll', 'up'],
    ['len', 'tren'],
  ])) {
    return [createDeterministicToolCall('scroll_page', { direction: 'UP' })];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['tat', 'tieng'],
    ['mute'],
    ['im', 'lang'],
  ])) {
    return [createControlToolCall('MUTE')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['bat', 'tieng'],
    ['mo', 'tieng'],
    ['unmute'],
  ])) {
    return [createControlToolCall('UNMUTE')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['am', 'luong', 'toi', 'da'],
    ['max', 'volume'],
    ['het', 'co'],
    ['to', 'nhat'],
  ])) {
    return [createControlToolCall('MAX_VOLUME')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['tang', 'am', 'luong'],
    ['tang', 'tieng'],
    ['to', 'len'],
    ['volume', 'up'],
  ])) {
    return [createControlToolCall('VOLUME_UP')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['giam', 'am', 'luong'],
    ['giam', 'tieng'],
    ['nho', 'lai'],
    ['volume', 'down'],
  ])) {
    return [createControlToolCall('VOLUME_DOWN')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['toan', 'man', 'hinh'],
    ['full', 'man', 'hinh'],
    ['fullscreen'],
    ['phong', 'to'],
  ])) {
    return [createControlToolCall('FULLSCREEN')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['tam', 'dung'],
    ['dung', 'phim'],
    ['dung', 'lai'],
    ['ngung'],
    ['pause'],
    ['tat', 'phim'],
  ])) {
    return [createControlToolCall('PAUSE')];
  }

  if (hasAnyPhrase(normalizedTokens, [
    ['phat', 'tiep'],
    ['tiep', 'tuc'],
    ['chay', 'tiep'],
    ['play'],
    ['bat', 'phim'],
    ['mo', 'video'],
  ])) {
    return [createControlToolCall('PLAY')];
  }

  return [];
}

async function executeDeterministicVoiceFallback(transcript, user, context) {
  const toolCalls = buildDeterministicVoiceToolCalls(transcript);
  if (toolCalls.length === 0) return null;

  const result = await executeToolCalls(toolCalls, user, context);
  const firstCall = toolCalls[0];
  const firstArgs = JSON.parse(firstCall.function.arguments || '{}');

  if (!result.directReply && result.commands.length > 0 && firstCall.function.name === 'navigate' && firstArgs.destination === 'SEARCH') {
    result.directReply = firstArgs.search_query
      ? `Dạ em tìm ${firstArgs.search_query} ngay đây!`
      : 'Dạ em mở tìm kiếm ngay đây!';
  }

  if (result.commands.length === 0 && !result.directReply) return null;
  return result;
}

// ====================================================================
// MAP & EXECUTE tool_calls
// ====================================================================
async function executeToolCalls(toolCalls, user, context) {
  const commands = [];
  let directReply = null;

  for (const call of toolCalls) {
    const { name, arguments: argsStr } = call.function;
    let args;
    try { args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr; } catch { continue; }

    switch (name) {
      case 'control_player':
        if (!context.is_video_playing) {
          directReply = "Bạn đang không xem phim nào cả, hãy mở một phim trước nhé!";
        } else {
          commands.push({ action: `VOICE_CMD_${args.action}`, payload: args });
          // Câu trả lời tuỳ chỉnh nâng cao
          if (args.action === 'CHANGE_EPISODE') directReply = `Dạ em chuyển sang tập ${args.episode_number} ngay cho bạn!`;
          else if (args.action === 'CHANGE_AUDIO') {
            const label = args.audio_type === 'vietsub' ? 'Phụ đề' : (args.audio_type === 'thuyet-minh' ? 'Thuyết minh' : 'Lồng tiếng');
            directReply = `Dạ em chuyển sang âm thanh ${label} ngay ạ.`;
          }
          else if (args.action === 'MAX_VOLUME') directReply = "Dạ tăng max âm lượng luôn ạ!";
        }
        break;

      case 'seek_video':
        if (!context.is_video_playing) {
          directReply = "Không có phim nào đang chiếu để tua bạn ơi!";
        } else {
          let seekSeconds = args.seconds || 0;
          // Smart Seek: tính giây từ position nếu có
          if (args.position && context.video_duration) {
            const dur = Number(context.video_duration);
            if (args.position === 'BEGINNING') seekSeconds = -999999; // Frontend sẽ clamp về 0
            else if (args.position === 'MIDDLE') seekSeconds = Math.floor(dur * 0.5) - 999999; // trick: set absolute
            else if (args.position === 'END') seekSeconds = Math.floor(dur * 0.9) - 999999;
            // Gửi seekTo (tuyệt đối) thay vì seekBy (tương đối)
            commands.push({ action: 'VOICE_CMD_SEEK_TO', payload: {
              time: args.position === 'BEGINNING' ? 0 : args.position === 'MIDDLE' ? Math.floor(dur * 0.5) : Math.floor(dur * 0.9)
            }});
            if (args.position === 'MIDDLE') directReply = 'Dạ tua tới giữa phim ngay!';
            else if (args.position === 'END') directReply = 'Dạ tua gần cuối phim luôn!';
            else directReply = 'Dạ quay lại đầu phim!';
          } else {
            commands.push({ action: 'VOICE_CMD_SEEK', payload: { seconds: seekSeconds } });
          }
        }
        break;

      case 'navigate':
        commands.push({ action: 'VOICE_CMD_NAVIGATE', payload: { destination: args.destination, search_query: args.search_query || '' } });
        break;

      case 'scroll_page':
        commands.push({ action: 'VOICE_CMD_SCROLL', payload: { direction: args.direction } });
        break;

      case 'play_specific_movie':
        try {
          // Gọi movieService để áp dụng text search / fuzzy search linh hoạt
          const searchResult = await movieService.search(args.movie_name, { limit: 1 });
          const movie = searchResult.data && searchResult.data.length > 0 ? searchResult.data[0] : null;

          if (movie) {
            const payload = { id: movie.id || movie._id.toString() };
            // Kèm tập + audio nếu có
            if (args.episode_number) payload.ep = args.episode_number;
            if (args.audio_type) payload.audio = args.audio_type;
            commands.push({ action: 'VOICE_CMD_NAVIGATE_TO_WATCH', payload });
            let replyParts = `Dạ em mở phim ${movie.name}`;
            if (args.episode_number) replyParts += ` tập ${args.episode_number}`;
            if (args.audio_type) {
              const audioLabel = args.audio_type === 'vietsub' ? 'phụ đề' : (args.audio_type === 'thuyet-minh' ? 'thuyết minh' : 'lồng tiếng');
              replyParts += ` ${audioLabel}`;
            }
            directReply = replyParts + ' ngay đây!';
          } else {
            directReply = `Tiếc quá, rạp em không có phim "${args.movie_name}" rồi.`;
          }
        } catch (e) { console.error('DB Error play_specific_movie:', e); }
        break;

      case 'interact_current_movie': {
        if (!user) {
          directReply = "Bạn vui lòng đăng nhập trước nhé!";
          break;
        }
        
        // Fix: route là /watch/:id (ObjectId), không phải /watching/:slug
        let movieId = null;
        const matchId = context.current_path.match(/\/watch\/([a-fA-F0-9]{24})/);
        if (matchId) movieId = matchId[1];

        if (!movieId) {
          directReply = "Bạn cần mở phim để thực hiện tương tác này!";
          break;
        }

        try {
          const movie = await Movie.findById(movieId).lean();
          if (!movie) { directReply = "Không tìm thấy phim!"; break; }

          if (args.action === 'FAVORITE') {
            const exists = await UserFavorite.findOne({ userId: user.id, movieId: movie._id });
            if (!exists) {
              await UserFavorite.create({ userId: user.id, movieId: movie._id });
              await movieService.invalidateForYou(user.id);
            }
            directReply = "Đã lưu phim vào danh sách yêu thích nha!";
          } else if (args.action === 'COMMENT') {
            // Auto-comment: nếu LLM bỏ trống comment_text, lấy luôn nội dung transcript gốc
            const commentContent = args.comment_text || context._transcript || 'Hay quá!';
            await Comment.create({ userId: user.id, movieId: movie._id, content: commentContent });
            directReply = `Đã gửi bình luận "${commentContent}" của bạn!`;
            commands.push({ action: 'VOICE_CMD_REFRESH_DATA' });
          }
        } catch (e) { console.error('DB Error interact:', e); directReply = "Lỗi khi xử lý dữ liệu ạ."; }
        break;
      }
    }
  }

  return { commands, directReply };
}


// ====================================================================
// CONTROLLER
// ====================================================================
const processVoiceCommand = async (req, res) => {
  try {
    const { transcript, context = {}, history = [] } = req.body;
    const user = req.user || null;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({ success: false, commands: [], reply: 'Em không nghe rõ!' });
    }

    // Lưu transcript vào context để interact_current_movie có thể dùng làm auto-comment
    context._transcript = transcript.trim();

    console.log(`[Timi AI] "${transcript.trim()}" | User: ${user?.id || 'GUEST'} | UI: ${JSON.stringify(context)}`);

    // Xây dựng messages[] có conversation history
    const messages = [
      { role: 'system', content: getSystemPrompt(context, user) },
    ];
    // Chèn lịch sử hội thoại (tối đa 6 entries = 3 cặp user+assistant)
    if (Array.isArray(history) && history.length > 0) {
      const safeHistory = history.slice(-6).map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: String(msg.content || '').slice(0, 200), // Giới hạn độ dài
      }));
      messages.push(...safeHistory);
    }
    messages.push({ role: 'user', content: transcript.trim() });

    const result = await complete({
      scope: 'TIMI',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 150,
      temperature: 0.3,
    });
    
    const toolCalls = result.toolCalls || [];
    let commandResult = await executeToolCalls(toolCalls, user, context);

    if (commandResult.commands.length === 0 && !commandResult.directReply) {
      const fallbackResult = await executeDeterministicVoiceFallback(transcript.trim(), user, context);
      if (fallbackResult) {
        commandResult.commands = fallbackResult.commands;
        commandResult.directReply = fallbackResult.directReply;
      }
    }

    const { commands, directReply } = commandResult;
    const reply = directReply || result.content || (commands.length > 0 ? 'Dạ xong rồi ạ!' : 'Mình không hiểu ý bạn!');

    // Generate Audio URL with ElevenLabs (TTS Cache)
    const audioUrl = await generateTtsAudio(reply);

    return res.json({ success: commands.length > 0 || !!directReply, commands, reply, audioUrl });
  } catch (err) {
    if (err.name === 'AbortError') return res.json({ success: false, commands: [], reply: 'Đường truyền đang bị nghẽn ạ.' });
    console.error('[Timi AI] Error:', err.message);
    return res.status(500).json({ success: false, commands: [], reply: 'Xin lỗi, Timi gặp lỗi hệ thống.' });
  }
};

const generateVoiceAudio = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing text parameter' });
    }

    const audioUrl = await generateTtsAudio(text);
    if (!audioUrl) return res.status(500).json({ success: false, message: 'Failed to generate TTS' });

    return res.json({ success: true, audioUrl });
  } catch (err) {
    console.error('[TTS Controller API] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  processVoiceCommand,
  generateVoiceAudio,
  // Shared exports for WebSocket service
  executeToolCalls,
  executeDeterministicVoiceFallback,
  buildDeterministicVoiceToolCalls,
  getSystemPrompt,
  TOOLS,
};
