const Movie = require('../models/movie.model');
const UserHistory = require('../models/user_history.model');
const UserFavorite = require('../models/user_favorite.model');
const Chat = require('../models/chat.model');
const mongoose = require('mongoose');

const { complete, stream } = require('./llm');
const { isRateLimitError } = require('./llm/errors');

const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const SYSTEM_PROMPT =
  process.env.CHATBOT_SYSTEM_PROMPT ||
  `Bạn là trợ lý AI thân thiện của nền tảng xem phim CinePhine.

MỤC TIÊU:
- Trả lời câu hỏi về phim, thể loại, quốc gia, đánh giá, bình luận, tài khoản và cách sử dụng website CinePhine.
- Luôn trả lời bằng tiếng Việt, văn phong tự nhiên, dễ hiểu, ngắn gọn.
- Ưu tiên sử dụng dữ liệu thật được backend cung cấp trong phần [DB_CONTEXT]. Không bịa thêm phim hoặc thông tin không có trong dữ liệu này.

CÁCH SỬ DỤNG NGỮ CẢNH:
- Backend sẽ gửi cho bạn hai phần:
  [USER_QUERY]  = câu hỏi gốc của người dùng.
  [DB_CONTEXT]  = dữ liệu đã truy vấn từ database/API CinePhine (JSON hoặc text có cấu trúc).
- Bạn KHÔNG tự gọi HTTP hay truy cập database, chỉ suy luận từ USER_QUERY và DB_CONTEXT.

HƯỚNG DẪN TRẢ LỜI:
- Nếu DB_CONTEXT có dữ liệu phim liên quan:
  * Trích xuất các thông tin quan trọng: tên phim, năm, thể loại, quốc gia, rating, mô tả ngắn...
  * Gợi ý hoặc giải thích dựa trên đúng dữ liệu đó.
  * Nếu danh sách quá dài, chỉ chọn 3–5 mục tiêu biểu.
- Nếu DB_CONTEXT trống hoặc không phù hợp:
  * Nói rõ là hiện tại không tìm thấy dữ liệu phù hợp trong hệ thống CinePhine.
  * Có thể đưa ra gợi ý chung (ví dụ: cách tìm kiếm khác), nhưng không bịa dữ liệu chi tiết.
- Với câu hỏi thuần về cách sử dụng website (đăng nhập, xem phim, thêm yêu thích...),
  bạn có thể trả lời dựa trên hiểu biết chung về một website xem phim chuẩn.

ĐỊNH DẠNG TRẢ LỜI:
- Không lặp lại nguyên văn USER_QUERY hay DB_CONTEXT.
- Không hiển thị JSON hoặc cấu trúc kỹ thuật nội bộ trừ khi người dùng yêu cầu rõ ràng.
- KHÔNG sử dụng bất kỳ định dạng Markdown nào (không dùng **, *, __, ##, tiêu đề, danh sách markdown...).
- KHÔNG bao quanh tên phim hoặc bất kỳ phần nào của câu trả lời bằng cặp ký tự **.
- Khi liệt kê phim, dùng dạng thuần văn bản:
  1. Tên phim – Năm – Thể loại chính.
- Nếu không chắc chắn, hãy nói rõ "Mình không có đủ dữ liệu trong hệ thống CinePhine để trả lời chính xác."`;

// ============================================
// HELPER FUNCTIONS
// ============================================
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectIntentByKeyword(message = '') {
  const msg = message.toLowerCase();
  if (
    msg.includes('phim') ||
    msg.includes('xem') ||
    msg.includes('thể loại') ||
    msg.includes('hành động') ||
    msg.includes('kinh dị') ||
    msg.includes('gợi ý') ||
    msg.includes('recommend') ||
    msg.includes('film') ||
    msg.includes('tv') ||
    msg.includes('series') ||
    msg.includes('mùa') ||
    msg.includes('tập') ||
    msg.includes('trailer') ||
    msg.includes('đánh giá') ||
    msg.includes('bình luận') ||
    msg.includes('quốc gia') ||
    msg.includes('năm') ||
    msg.includes('phát hành')
  ) {
    return 'movie_info';
  }
  return 'general';
}

function normalizeImageAttachmentData(data) {
  const value = String(data || '').trim();
  if (!value) throw new Error('Image attachment data is required');

  const base64 = value.includes(',') ? value.split(',').pop().trim() : value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error('Invalid image attachment data');
  }

  const decoded = Buffer.from(base64, 'base64');
  if (decoded.length === 0) throw new Error('Invalid image attachment data');
  if (decoded.length > MAX_IMAGE_ATTACHMENT_BYTES) {
    throw new Error('Image attachment exceeds 5MB limit');
  }

  return base64;
}

function normalizeChatAttachments(attachments = []) {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) {
    throw new Error('Chat attachments must be an array');
  }
  if (attachments.length > 1) {
    throw new Error('Only one image attachment is supported');
  }

  return attachments.map((attachment) => {
    const type = attachment?.type || 'image';
    if (type !== 'image') throw new Error(`Unsupported attachment type: ${type}`);

    const mimeType = String(attachment?.mime_type || attachment?.mimeType || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error(`Unsupported image type: ${mimeType || 'unknown'}`);
    }

    return {
      type: 'image',
      mime_type: mimeType,
      data: normalizeImageAttachmentData(attachment?.data),
    };
  });
}

function buildUserPromptText(userQuery, dbContext, hasImageAttachment = false) {
  const trimmedQuery = String(userQuery || '').trim();
  const isImageOnlyPlaceholder = ['Gửi một ảnh', 'Gá»­i má»™t áº£nh'].includes(trimmedQuery);
  const effectiveQuery = hasImageAttachment && (!trimmedQuery || isImageOnlyPlaceholder)
    ? 'Hãy mô tả ảnh này và trả lời theo ngữ cảnh CinePhine nếu ảnh liên quan đến phim.'
    : trimmedQuery;

  return `[USER_QUERY]\n${effectiveQuery}\n\n[DB_CONTEXT]\n${JSON.stringify(dbContext, null, 2)}`;
}

// ============================================
// INTENT CLASSIFIER
// ============================================
async function classifyIntentWithLlm(message) {
  const classifierPrompt = `Bạn là bộ phân loại truy vấn cho trợ lý phim CinePhine.
    Người dùng sẽ gửi câu hỏi bằng tiếng Việt hoặc tiếng Anh. Nhiệm vụ của bạn:
    - Phân loại xem câu hỏi có liên quan tới phim trong hệ thống hay không (intent).
    - Nếu liên quan tới phim (intent = "movie_info") thì phân loại chi tiết kiểu truy vấn:
    + "top"    : hỏi top phim / phim hay nhất / trending / nổi tiếng
  + "new"    : hỏi phim mới / phim mới cập nhật / phim mới ra mắt / phim vừa thêm
    + "genre"  : hỏi theo thể loại (ví dụ: phim kinh dị, phim hành động Mỹ, ...)
    + "actor"  : hỏi theo diễn viên / cast (ví dụ: phim có Tom Cruise, phim của Dwayne Johnson, ...)
    + "search" : tìm kiếm phim theo tên / từ khóa cụ thể
  + "other"  : vẫn là movie_info nhưng không rơi vào các loại trên

    Bạn CHỈ được trả về JSON hợp lệ, không có giải thích thêm, KHÔNG dùng markdown.

    Schema JSON:
    {
    "intent": "movie_info" | "general",
  "queryType": "top" | "new" | "genre" | "actor" | "search" | "other",
    "genre": string | null,
    "actor": string | null,
    "keyword": string | null
    }

    Quy tắc:
    - intent = "movie_info" nếu câu hỏi liên quan tới phim/series/tập phim/thể loại/quốc gia/diễn viên/trailer/đánh giá/bình luận... trên một website xem phim.
    - intent = "general" nếu câu hỏi không liên quan tới phim hoặc CinePhine.
- queryType: "top" nếu câu hỏi nhấn mạnh top, hay nhất, nổi bật, trending...
- queryType: "genre" nếu câu hỏi nhấn mạnh thể loại (hành động, kinh dị, lãng mạn, ...).
- queryType: "actor" nếu câu hỏi nhấn mạnh diễn viên / cast.
- queryType: "search" nếu người dùng đưa tên/từ khóa phim cụ thể để tìm.
- queryType: "other" nếu không rõ ràng.
    - genre: chuỗi tên thể loại chính (nếu có, ví dụ: "hành động", "kinh dị"), ngược lại null.
    - actor: tên diễn viên nếu có, ngược lại null.
    - keyword: từ khóa/tên phim chính để tìm kiếm nếu có, ngược lại null.

    Câu hỏi của người dùng:
    ${message}`;

  try {
    const data = await complete({
      scope: 'CHATBOT_INTENT',
      messages: [
        {
          role: 'user',
          content: classifierPrompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const rawText = data.content?.trim() || '{}';
    const parsed = JSON.parse(rawText);

    if (!parsed || (parsed.intent !== 'movie_info' && parsed.intent !== 'general')) {
      throw new Error('Invalid intent from LLM provider');
    }

    return {
      intent: parsed.intent,
      queryType: parsed.queryType || 'other',
      genre: typeof parsed.genre === 'string' ? parsed.genre : null,
      actor: typeof parsed.actor === 'string' ? parsed.actor : null,
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : null,
    };
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new Error(`LLM rate limit: ${error.message}`);
    }
    throw error;
  }
}

// ============================================
// MAIN LLM CALLER
// ============================================
function buildChatMessages({ userQuery, dbContext, history = [], attachments = [] }) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  const normalizedAttachments = normalizeChatAttachments(attachments);

  if (history && history.length > 0) {
    history.slice(-10).forEach((msg) => {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    });
  }

  const userPrompt = buildUserPromptText(userQuery, dbContext, normalizedAttachments.length > 0);
  const userContent = normalizedAttachments.length > 0
    ? [
      { type: 'text', text: userPrompt },
      ...normalizedAttachments.map((attachment) => ({
        type: 'image_url',
        image_url: {
          url: `data:${attachment.mime_type};base64,${attachment.data}`,
        },
      })),
    ]
    : userPrompt;

  messages.push({
    role: 'user',
    content: userContent,
  });

  return messages;
}

async function callLLMWithFallback({
  userQuery,
  dbContext,
  history = [],
  attachments = [],
  model = null,
  llmComplete = complete,
}) {
  const data = await llmComplete({
    scope: 'CHATBOT',
    ...(model ? { model } : {}),
    messages: buildChatMessages({ userQuery, dbContext, history, attachments }),
    temperature: 0.7,
  });

  const rawText = data.content?.trim() || '';
  return rawText.replace(/\*\*/g, '');
}

async function callLLMStreamWithFallback({
  userQuery,
  dbContext,
  history = [],
  attachments = [],
  onToken,
  llmStream = stream,
  llmComplete = complete,
}) {
  const messages = buildChatMessages({ userQuery, dbContext, history, attachments });
  let streamedText = '';

  try {
    const result = llmStream({
      scope: 'CHATBOT',
      messages,
      temperature: 0.7,
      onToken: (token) => {
        streamedText += token;
        if (onToken) onToken(token);
      },
    });

    if (result && typeof result[Symbol.asyncIterator] === 'function') {
      for await (const chunk of result) {
        const token = typeof chunk === 'string' ? chunk : chunk?.content || '';
        if (!token) continue;
        streamedText += token;
        if (onToken) onToken(token);
      }
      return streamedText.replace(/\*\*/g, '');
    }

    const resolved = await result;
    const content = (resolved?.content || streamedText || '').trim();
    return content.replace(/\*\*/g, '');
  } catch (error) {
    if (streamedText) throw error;
    return callLLMWithFallback({ userQuery, dbContext, history, attachments, llmComplete });
  }
}

// ============================================
// FORMAT ANSWER WITH HTML AND MOVIE LINKS
// ============================================
function formatAnswerWithMovieLinks(answer, dbContext) {
  if (!answer || !dbContext) return answer;

  // Collect all movie titles and IDs from context
  const movieMap = new Map();

  // Add movies from various context sources
  if (dbContext.currentMovie) {
    movieMap.set(dbContext.currentMovie.title.toLowerCase(), {
      id: dbContext.currentMovie.id,
      title: dbContext.currentMovie.title,
    });
  }

  if (dbContext.topMovies) {
    dbContext.topMovies.forEach((movie) => {
      movieMap.set(movie.title.toLowerCase(), {
        id: movie.id,
        title: movie.title,
      });
    });
  }

  if (dbContext.newMovies) {
    dbContext.newMovies.forEach((movie) => {
      movieMap.set(movie.title.toLowerCase(), {
        id: movie.id,
        title: movie.title,
      });
    });
  }

  if (dbContext.genreTopMovies) {
    dbContext.genreTopMovies.forEach((movie) => {
      movieMap.set(movie.title.toLowerCase(), {
        id: movie.id,
        title: movie.title,
      });
    });
  }

  if (dbContext.actorMovies) {
    dbContext.actorMovies.forEach((movie) => {
      movieMap.set(movie.title.toLowerCase(), {
        id: movie.id,
        title: movie.title,
      });
    });
  }

  if (dbContext.matchedMovies) {
    dbContext.matchedMovies.forEach((movie) => {
      movieMap.set(movie.title.toLowerCase(), {
        id: movie.id,
        title: movie.title,
      });
    });
  }

  // If no movies found, return original answer
  if (movieMap.size === 0) {
    return formatPlainTextToHTML(answer);
  }

  // Replace movie titles with HTML links
  let formattedAnswer = answer;

  // Sort by title length (longest first) to avoid partial matches
  const sortedMovies = Array.from(movieMap.values()).sort(
    (a, b) => b.title.length - a.title.length,
  );

  sortedMovies.forEach((movie) => {
    const title = movie.title;
    const movieId = movie.id;

    // Escape special regex characters in title
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create regex to match the title (case-insensitive, word boundaries)
    // Use word boundaries but allow Vietnamese characters
    const regex = new RegExp(`(${escapedTitle})`, 'gi');

    // Replace with HTML link
    formattedAnswer = formattedAnswer.replace(regex, (match) => {
      // Check if already inside an HTML tag
      const beforeMatch = formattedAnswer.substring(0, formattedAnswer.indexOf(match));
      const lastTagIndex = beforeMatch.lastIndexOf('<');
      const lastTagCloseIndex = beforeMatch.lastIndexOf('>');

      // If we're inside a tag (last < is after last >), don't replace
      if (lastTagIndex > lastTagCloseIndex) {
        return match;
      }

      // Check if already a link
      if (beforeMatch.includes(`href="/movie/${movieId}"`)) {
        return match;
      }

      return `<a href="/movie/${movieId}" class="chatbot-movie-link" style="color: var(--primary-color); font-weight: 600; text-decoration: none; transition: all 0.2s;">${match}</a>`;
    });
  });

  // Format plain text to HTML (line breaks, lists, etc.)
  return formatPlainTextToHTML(formattedAnswer);
}

// Format plain text to HTML with basic styling
function formatPlainTextToHTML(text) {
  if (!text) return text;

  // Replace line breaks
  let html = text.replace(/\n\n/g, '</p><p style="margin: 0.5rem 0;">').replace(/\n/g, '<br />');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = `<p style="margin: 0.5rem 0; line-height: 1.6;">${html}</p>`;
  } else if (!html.startsWith('<p')) {
    html = `<p style="margin: 0.5rem 0; line-height: 1.6;">${html}</p>`;
  }

  // Format numbered lists (1. 2. 3.)
  html = html.replace(
    /(\d+)\.\s+([^\n<]+)/g,
    '<span style="display: block; margin: 0.25rem 0; padding-left: 1rem;">$1. $2</span>',
  );

  // Format bullet points (- or •)
  html = html.replace(
    /^[-•]\s+([^\n<]+)/gm,
    '<span style="display: block; margin: 0.25rem 0; padding-left: 1rem;">• $1</span>',
  );

  return html;
}

// ============================================
// BUILD DB CONTEXT
// ============================================
async function buildDbContextForMovieIntent({ userId, message, metadata, classifier }) {
  const context = {};
  const msg = message.toLowerCase();
  const queryType = classifier?.queryType || 'other';
  const genreFromAi = classifier?.genre || null;
  const actorFromAi = classifier?.actor || null;
  const keywordFromAi = classifier?.keyword || null;

  // 1. Current movie from metadata
  if (metadata?.movieId) {
    try {
      const movieId = mongoose.Types.ObjectId.isValid(metadata.movieId) ? metadata.movieId : null;
      if (movieId) {
        const movie = await Movie.findById(movieId).lean();
        if (movie) {
          context.currentMovie = {
            id: movie._id.toString(),
            title: movie.name,
            original_name: movie.original_name,
            slug: movie.slug,
            year: movie.year,
            genres: movie.categories,
            country: movie.country,
            description: movie.content,
            rating: movie.rating,
            totalRatings: movie.totalRatings,
            viewCount: movie.viewCount,
            type: movie.type,
          };
        }
      }
    } catch (e) {
      console.error('Error fetching current movie:', e);
    }
  }

  // 2. Top movies
  const topWords = ['top', 'hay nhất', 'phim hot', 'phổ biến', 'phim trending', 'nổi tiếng'];
  if (queryType === 'top' || topWords.some((word) => msg.includes(word))) {
    const topMovies = await Movie.find()
      .sort({ rating: -1, totalRatings: -1, viewCount: -1 })
      .limit(10)
      .lean();

    context.topMovies = topMovies.map((m) => ({
      id: m._id.toString(),
      title: m.name,
      year: m.year,
      genres: m.categories,
      country: m.country,
      rating: m.rating,
      totalRatings: m.totalRatings,
      viewCount: m.viewCount,
    }));
  }

  // 3. New movies
  const newWords = [
    'phim mới',
    'mới cập nhật',
    'mới ra mắt',
    'vừa thêm',
    'mới nhất',
    'cập nhật gần đây',
  ];
  if (queryType === 'new' || newWords.some((word) => msg.includes(word))) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let newMovies = await Movie.find({
      $or: [
        { isNewRelease: true },
        { updatedAt: { $gte: thirtyDaysAgo } },
        { createdAt: { $gte: thirtyDaysAgo } },
      ],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(20)
      .lean();

    if (newMovies.length === 0) {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      newMovies = await Movie.find({
        $or: [
          { isNewRelease: true },
          { updatedAt: { $gte: sixtyDaysAgo } },
          { createdAt: { $gte: sixtyDaysAgo } },
        ],
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(15)
        .lean();
    }

    newMovies.sort((a, b) => {
      if (a.isNewRelease && !b.isNewRelease) return -1;
      if (!a.isNewRelease && b.isNewRelease) return 1;
      const aTime = a.updatedAt || a.createdAt || 0;
      const bTime = b.updatedAt || b.createdAt || 0;
      return bTime - aTime;
    });

    newMovies = newMovies.slice(0, 15);

    context.newMovies = newMovies.map((m) => ({
      id: m._id.toString(),
      title: m.name,
      year: m.year,
      genres: m.categories,
      country: m.country,
      rating: m.rating,
      viewCount: m.viewCount,
      isNewRelease: m.isNewRelease,
      updatedAt: m.updatedAt,
      createdAt: m.createdAt,
    }));
  }

  // 4. Genre search
  const genreWords = ['thể loại', 'genre', 'phim'];
  const shouldTryGenre = queryType === 'genre' || genreWords.some((word) => msg.includes(word));
  if (shouldTryGenre) {
    let genreKeyword = genreFromAi;
    if (!genreKeyword) {
      const genreMatch =
        message.match(/thể loại\s+([^\.,!?\n]+)/i) || message.match(/genre\s+([^\.,!?\n]+)/i);
      if (genreMatch) {
        genreKeyword = genreMatch[1].trim();
      }
    }

    if (genreKeyword) {
      const genreRegex = new RegExp(genreKeyword, 'i');
      const genreMovies = await Movie.find({
        $or: [{ 'categories.name': genreRegex }, { 'categories.slug': genreRegex }],
      })
        .sort({ viewCount: -1 })
        .limit(10)
        .lean();

      context.genreKeyword = genreKeyword;
      context.genreTopMovies = genreMovies.map((m) => ({
        id: m._id.toString(),
        title: m.name,
        year: m.year,
        genres: m.categories,
        country: m.country,
        rating: m.rating,
        viewCount: m.viewCount,
      }));
    }
  }

  // 5. Actor search
  const shouldTryActor = queryType === 'actor';
  if (shouldTryActor) {
    let actorKeyword = actorFromAi;
    if (!actorKeyword) {
      const actorMatch =
        message.match(/diễn viên\s+([^\.,!?\n]+)/i) ||
        message.match(/actor\s+([^\.,!?\n]+)/i) ||
        message.match(/cast\s+([^\.,!?\n]+)/i);
      if (actorMatch) {
        actorKeyword = actorMatch[1].trim();
      }
    }

    if (actorKeyword) {
      const actorRegex = new RegExp(actorKeyword, 'i');
      const actorMovies = await Movie.find({
        actor: { $regex: actorRegex },
      })
        .sort({ viewCount: -1 })
        .limit(10)
        .lean();

      context.actorKeyword = actorKeyword;
      context.actorMovies = actorMovies.map((m) => ({
        id: m._id.toString(),
        title: m.name,
        year: m.year,
        actors: m.actor,
        genres: m.categories,
        country: m.country,
        viewCount: m.viewCount,
      }));
    }
  }

  // 6. Keyword search
  const shouldTrySearch = queryType === 'search' || queryType === 'other';
  if (shouldTrySearch) {
    let keyword = keywordFromAi;
    if (!keyword) {
      const keywordMatch = message.match(/phim\s+(.+)/i);
      if (keywordMatch) {
        keyword = keywordMatch[1].trim();
      }
    }

    if (keyword) {
      const regex = new RegExp(keyword, 'i');
      const movies = await Movie.find({
        $or: [{ name: regex }, { original_name: regex }, { slug: regex }],
      })
        .sort({ viewCount: -1 })
        .limit(10)
        .lean();

      context.searchKeyword = keyword;
      context.matchedMovies = movies.map((m) => ({
        id: m._id.toString(),
        title: m.name,
        original_name: m.original_name,
        year: m.year,
        genres: m.categories,
        country: m.country,
        rating: m.rating,
        viewCount: m.viewCount,
      }));
    }
  }

  // 7. User history & favorites
  if (userId) {
    const history = await UserHistory.find({ userId }).sort({ createdAt: -1 }).limit(10).lean();
    context.recentHistory = history.map((h) => ({
      movieId: h.movieId.toString(),
      lastViewedAt: h.createdAt,
    }));

    const favorites = await UserFavorite.find({ userId }).limit(20).lean();
    context.favorites = favorites.map((f) => f.movieId.toString());
  }

  return context;
}

// ============================================
// MAIN HANDLER
// ============================================
async function prepareChatRequest({
  userId,
  message,
  history,
  metadata,
  sessionId,
  attachments = [],
  chatModel = Chat,
  classifyIntent = classifyIntentWithLlm,
  buildDbContext = buildDbContextForMovieIntent,
}) {
  const normalizedAttachments = normalizeChatAttachments(attachments);

  // 1. Load or create chat session
  let chatSession = null;
  try {
    chatSession = await chatModel.findOrCreateSession({ userId, sessionId });
    if (chatSession && chatSession.messages.length > 0) {
      history = chatSession.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    } else if (!history || history.length === 0) {
      history = [];
    }
  } catch (e) {
    console.error('Error loading chat session:', e);
    if (!history || history.length === 0) {
      history = [];
    }
  }

  // 2. Save user message
  try {
    if (chatSession) {
      await chatSession.addMessage('user', message);
      if (metadata) {
        const updatedMetadata = { ...chatSession.metadata, ...metadata };
        if (updatedMetadata.movieId && typeof updatedMetadata.movieId === 'string') {
          if (mongoose.Types.ObjectId.isValid(updatedMetadata.movieId)) {
            updatedMetadata.movieId = new mongoose.Types.ObjectId(updatedMetadata.movieId);
          } else {
            delete updatedMetadata.movieId;
          }
        }
        chatSession.metadata = updatedMetadata;
        await chatSession.save();
      }
    }
  } catch (e) {
    console.error('Error saving user message:', e);
  }

  // 3. Classify intent using OpenAI
  let intent = 'general';
  let classifier = null;

  const keywordIntent = detectIntentByKeyword(message);
  const needsClassifier =
    keywordIntent === 'movie_info' &&
    (message.length > 30 ||
      message.match(/\b(top|hay nhất|trending|mới|mới cập nhật|thể loại|diễn viên|cast)\b/i));

  if (needsClassifier) {
    try {
      classifier = await classifyIntent(message);
      intent = classifier.intent || keywordIntent;
    } catch (e) {
      console.warn('⚠️ LLM classifier failed, using keyword detection:', e.message);
      intent = keywordIntent;
      classifier = {
        intent: keywordIntent,
        queryType: 'other',
        genre: null,
        actor: null,
        keyword: null,
      };
    }
  } else {
    intent = keywordIntent;
    classifier = {
      intent: keywordIntent,
      queryType: 'other',
      genre: null,
      actor: null,
      keyword: null,
    };
  }

  // 4. Build DB context
  let dbContext = {};
  if (intent === 'movie_info') {
    dbContext = await buildDbContext({ userId, message, metadata, classifier });
  } else {
    dbContext = { note: 'general question, no movie-specific DB context' };
  }

  return { chatSession, history, intent, dbContext, attachments: normalizedAttachments };
}

async function handleChat({ userId, message, history, metadata, sessionId, attachments }) {
  const {
    chatSession,
    history: resolvedHistory,
    intent,
    dbContext,
    attachments: normalizedAttachments,
  } = await prepareChatRequest({
    userId,
    message,
    history,
    metadata,
    sessionId,
    attachments,
  });

  // 5. Generate response using fallback chain
  let answer;
  try {
    answer = await callLLMWithFallback({
      userQuery: message,
      dbContext,
      history: resolvedHistory,
      attachments: normalizedAttachments,
    });
  } catch (error) {
    console.error('All LLM providers failed:', error.message);
    const fallbackPrefix =
      'Hiện tại hệ thống trợ lý AI đang quá tải hoặc gặp sự cố tạm thời, nên mình không thể trả lời chi tiết bằng AI.';

    if (intent === 'movie_info') {
      answer = `${fallbackPrefix} Tuy nhiên, bạn có thể thử:
- Sử dụng thanh tìm kiếm để tìm tên phim hoặc thể loại bạn quan tâm.
- Vào trang chủ để xem phim mới cập nhật, top phim hoặc phim đang hot.
- Mở trang chi tiết phim để xem mô tả, diễn viên, đánh giá và bình luận.`;
    } else {
      answer = `${fallbackPrefix} Bạn có thể thử lại sau ít phút, hoặc sử dụng menu và thanh tìm kiếm trên CinePhine để tự tra cứu thông tin.`;
    }
  }

  // 5.1. Format answer with HTML and movie links
  answer = formatAnswerWithMovieLinks(answer, dbContext);

  // 6. Save assistant response (save plain text version, not HTML)
  const plainTextAnswer = answer
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  try {
    if (chatSession) {
      await chatSession.addMessage('assistant', plainTextAnswer);
    }
  } catch (e) {
    console.error('Error saving assistant message:', e);
  }

  // Return HTML formatted answer for frontend display
  return answer;
}

async function handleChatStream({
  userId,
  message,
  history,
  metadata,
  sessionId,
  attachments,
  onToken,
  chatModel = Chat,
  llmStream = stream,
  llmComplete = complete,
  classifyIntent = classifyIntentWithLlm,
  buildDbContext = buildDbContextForMovieIntent,
}) {
  const {
    chatSession,
    history: resolvedHistory,
    intent,
    dbContext,
    attachments: normalizedAttachments,
  } = await prepareChatRequest({
    userId,
    message,
    history,
    metadata,
    sessionId,
    attachments,
    chatModel,
    classifyIntent,
    buildDbContext,
  });

  let answer;
  try {
    answer = await callLLMStreamWithFallback({
      userQuery: message,
      dbContext,
      history: resolvedHistory,
      attachments: normalizedAttachments,
      onToken,
      llmStream,
      llmComplete,
    });
  } catch (error) {
    console.error('Streaming LLM failed:', error.message);
    const fallbackPrefix =
      'Hiện tại hệ thống trợ lý AI đang quá tải hoặc gặp sự cố tạm thời, nên mình không thể trả lời chi tiết bằng AI.';

    if (intent === 'movie_info') {
      answer = `${fallbackPrefix} Tuy nhiên, bạn có thể thử:
- Sử dụng thanh tìm kiếm để tìm tên phim hoặc thể loại bạn quan tâm.
- Vào trang chủ để xem phim mới cập nhật, top phim hoặc phim đang hot.
- Mở trang chi tiết phim để xem mô tả, diễn viên, đánh giá và bình luận.`;
    } else {
      answer = `${fallbackPrefix} Bạn có thể thử lại sau ít phút, hoặc sử dụng menu và thanh tìm kiếm trên CinePhine để tự tra cứu thông tin.`;
    }
  }

  const formattedAnswer = formatAnswerWithMovieLinks(answer, dbContext);
  const plainText = formattedAnswer
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

  try {
    if (chatSession) {
      await chatSession.addMessage('assistant', plainText);
    }
  } catch (e) {
    console.error('Error saving assistant message:', e);
  }

  return { answer: formattedAnswer, plainText };
}

module.exports = {
  handleChat,
  handleChatStream,
  callLLMStreamWithFallback,
};
