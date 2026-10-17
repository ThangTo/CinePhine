// Tools the chat agent can call (OpenAI function format; the Gemini provider maps it).
// executeTool returns { result, movies, action }: `result` goes back to the LLM,
// `movies` / `action` go straight to the UI.

const MAX_RESULTS = 6;
const POOL_SIZE = 40; // discovery over-fetch: runtime and already-seen filters run after the query
const MAX_WATCHED = 300;
const MAX_MEMORY = 20;
const MAX_REPLIES = 4;
const MAX_REPLY_CHARS = 40;
const AGE_LEVELS = { T12: 12, T14: 14, T16: 16, '18+': 18 }; // every age_rating value in the DB
// Quick replies shown under discovery results when the LLM attached none of its own.
const NEXT_STEPS = ['Gợi ý phim khác', 'Phim ngắn hơn', 'Phim điểm cao hơn'];
const ALL_SEEN_NOTE ='Không còn phim mới phù hợp: các phim này người dùng đã xem hoặc đã được gợi ý.';
const LOGIN_REQUIRED = { result: { error: 'login_required', message: 'Cần đăng nhập để dùng tính năng này.' } };
const NOT_FOUND = { result: { error: 'not_found', message: 'Không tìm thấy phim phù hợp.' } };

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

const movieRef = {
  movie_id: { type: 'string', description: 'movie_id từ kết quả công cụ hoặc PHIM ĐANG XEM' },
  title: { type: 'string', description: 'Tên phim, dùng khi chưa có movie_id' },
};

const TOOLS = [
  fn(
    'search_movies',
    'Tìm phim theo tên/từ khóa, hoặc lọc để gợi ý (bỏ trống query): thể loại, quốc gia, loại phim, năm, thời lượng, độ tuổi, điểm. Khi lọc, phim người dùng đã xem hoặc đã được gợi ý trong cuộc trò chuyện tự bị loại.',
    {
      query: { type: 'string', description: 'Tên phim hoặc từ khóa; bỏ trống nếu chỉ lọc/gợi ý' },
      genre: { type: 'string', description: 'Một hoặc nhiều thể loại cách nhau dấu phẩy (phim phải có đủ), vd "hành động, hài hước"' },
      country: { type: 'string', description: 'Quốc gia, vd "Hàn Quốc", "Nhật Bản"' },
      type: {
        type: 'string',
        enum: ['single', 'series', 'hoathinh', 'tvshows'],
        description: 'single=phim lẻ, series=phim bộ, hoathinh=hoạt hình, tvshows=TV show',
      },
      year: { type: 'integer' },
      max_minutes: { type: 'integer', description: 'Thời lượng tối đa (phút); phim bộ tính theo mỗi tập' },
      max_age: { type: 'integer', description: 'Độ tuổi tối đa của nội dung: 12, 14 hoặc 16 (xem cùng trẻ nhỏ/gia đình = 12)' },
      min_score: { type: 'number', description: 'Điểm TMDB tối thiểu 0-10, vd 7 cho phim "chắc ăn"' },
      sort: { type: 'string', enum: ['newest', 'top_rated', 'views'], description: 'newest=mới, top_rated=điểm cao, views=xem nhiều' },
      count: { type: 'integer', description: 'Số phim trả về, 1-6 (mặc định 6). Chế độ chọn giúp 1 phim: 3' },
    },
  ),
  fn(
    'get_movie_details',
    'Lấy chi tiết một phim: nội dung, tagline, từ khóa, thời lượng, diễn viên kèm vai, đạo diễn, số tập, vài review (TMDB).',
    movieRef,
  ),
  fn(
    'recommend_movies',
    'Gợi ý phim KHÔNG kèm bộ lọc. Nếu người dùng nêu thể loại/quốc gia/loại phim/năm thì dùng search_movies. for_me=theo gu người dùng (cần đăng nhập), similar=giống một phim, trending=đang hot, top_rated=điểm cao, new=mới ra.',
    {
      source: { type: 'string', enum: ['for_me', 'similar', 'trending', 'top_rated', 'new'] },
      ...movieRef,
      count: { type: 'integer', description: 'Số phim trả về, 1-6 (mặc định 6). Chế độ chọn giúp 1 phim: 3' },
    },
    ['source'],
  ),
  fn(
    'get_my_library',
    'Xem lịch sử xem (có % tiến độ), danh sách yêu thích hoặc xem sau của người dùng (cần đăng nhập).',
    { list: { type: 'string', enum: ['history', 'favorites', 'watchlist'] } },
    ['list'],
  ),
  fn('add_to_watchlist', 'Thêm phim vào danh sách xem sau (cần đăng nhập).', movieRef),
  fn('open_movie', 'Mở phim cho người dùng: detail=trang chi tiết, watch=xem ngay.', {
    ...movieRef,
    mode: { type: 'string', enum: ['detail', 'watch'] },
  }),
  fn(
    'update_memory',
    'Ghi nhớ một sở thích lâu dài của người dùng (add), hoặc xóa toàn bộ ghi nhớ (clear). Cần đăng nhập.',
    {
      action: { type: 'string', enum: ['add', 'clear'] },
      note: { type: 'string', description: 'Sở thích cần nhớ, một câu ngắn' },
    },
    ['action'],
  ),
  fn(
    'suggest_replies',
    'Hiện 2-4 nút trả lời nhanh dưới câu trả lời. Gọi khi bạn hỏi lại người dùng (tâm trạng, thời gian rảnh, xem cùng ai...) hoặc để gợi ý bước tiếp theo.',
    { options: { type: 'array', items: { type: 'string' }, description: 'Mỗi nút một câu ngắn (tối đa ~30 ký tự), là lời người dùng sẽ gửi' } },
    ['options'],
  ),
];

// Accent-insensitive compare so "phim han", "Hàn Quốc" and "han-quoc" all match.
const fold = (s = '') =>
  String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').trim();

function matchSlug(options = [], text) {
  const t = fold(text).replace(/^phim\s+/, '');
  if (!t) return undefined;
  const exact = options.find((o) => fold(o.name) === t || o.slug === t.replace(/\s+/g, '-'));
  const partial = options.find((o) => fold(o.name).includes(t) || t.includes(fold(o.name)));
  return (exact || partial)?.slug;
}

const stripHtml = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// Fields may be an array of strings/{name}, a single string (country: "Âu Mỹ") or null.
const names = (list) => [].concat(list ?? []).map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean);

// Works on both transformMovie output and raw lean Movie docs (populated library rows).
function toMovieCard(m) {
  if (!m || m.isHidden) return null;
  return {
    id: String(m.id || m._id),
    slug: m.slug,
    title: m.title || m.name,
    englishTitle: m.englishTitle || m.original_name || '',
    year: m.year,
    poster: m.poster || m.poster_url || '',
    thumb: m.backgroundImage || m.thumb_url || '',
    quality: m.quality || '',
    episodeCurrent: m.currentEpisode || '',
    // imdb is 0 across the catalog and user ratings are rare, so TMDB is the real score.
    rating: Math.round((m.imdb || m.tmdb?.vote_average || m.rating || 0) * 10) / 10,
    duration: m.duration || m.time || '',
    ageRating: m.ageRating || m.age_rating || '',
    genres: names(m.genres || m.categories).slice(0, 3),
    ...(m.progress != null ? { progress: m.progress } : {}),
    ...(m.reason ? { reason: m.reason } : {}),
  };
}

// What the LLM sees: no image URLs, saves tokens.
const brief = ({ poster, thumb, slug, id, ...rest }) => ({ movie_id: id, ...rest });

// `skip`: ids to leave out (watched / already suggested). If that empties the list,
// the skipped ones are returned anyway with a note so the LLM does not present them as new.
// `block`: ids never returned ("not for me").
function moviesResult(list = [], extra = {}, { skip, block, count = MAX_RESULTS } = {}) {
  const seen = new Set(block);
  const cards = list.map(toMovieCard).filter((c) => c && !seen.has(c.id) && seen.add(c.id));
  const fresh = skip ? cards.filter((c) => !skip.has(c.id)) : cards;
  const allSeen = !fresh.length && cards.length > 0;
  const movies = (allSeen ? cards : fresh).slice(0, count);
  return {
    result: { count: movies.length, movies: movies.map(brief), ...extra, ...(allSeen && { note: ALL_SEEN_NOTE }) },
    movies,
  };
}

const countOf = (args) => Math.min(Math.max(parseInt(args.count, 10) || MAX_RESULTS, 1), MAX_RESULTS);

// "45 phút/tập" -> 45, "97 Phút" -> 97, "N/A" -> null. Series store the per-episode runtime.
const minutesOf = (time) => parseInt(String(time || '').match(/(\d+)\s*phút/i)?.[1], 10) || null;

// The lowest rating in the DB is T12, so "for kids" still allows T12.
const ageRatingsUpTo = (maxAge) => Object.keys(AGE_LEVELS).filter((k) => AGE_LEVELS[k] <= Math.max(maxAge, 12));

async function seenIds(userId, { models }, shownIds = []) {
  const [history, user] = userId
    ? await Promise.all([
        models.UserHistory.find({ userId }).sort({ lastWatchedAt: -1 }).limit(MAX_WATCHED).select('movieId').lean(),
        models.User.findById(userId).select('dislikedMovieIds').lean(),
      ])
    : [[], null];
  return {
    skip: new Set([...shownIds, ...history.map((h) => String(h.movieId))]),
    block: new Set((user?.dislikedMovieIds || []).map(String)),
  };
}

async function searchFilters(args, movieService) {
  const { genres = [], countries = [] } = (await movieService.getFilterOptions().catch(() => null)) || {};
  const filters = {};
  const unknownFilters = [];
  const genreSlugs = [];
  for (const text of String(args.genre || '').split(/,|\s+và\s+/)) {
    if (!text.trim()) continue;
    const slug = matchSlug(genres, text);
    if (slug) genreSlugs.push(slug);
    else unknownFilters.push(text.trim());
  }
  if (genreSlugs.length === 1) filters.genre = genreSlugs[0];
  else if (genreSlugs.length > 1) filters.genres = genreSlugs; // buildQuery: movie must have all of them
  if (args.country) {
    const slug = matchSlug(countries, args.country);
    if (slug) filters.country = slug;
    else unknownFilters.push(args.country);
  }
  if (args.type) filters.type = args.type;
  if (parseInt(args.year, 10)) filters.year = parseInt(args.year, 10);
  const maxAge = parseInt(args.max_age, 10);
  if (maxAge < 18) filters.ageRating = ageRatingsUpTo(maxAge);
  // top_rated: buildQuery always sorts by year first, so filter good scores in the DB and rank by score afterwards.
  const minScore = Number(args.min_score) || (args.sort === 'top_rated' ? 7 : 0);
  if (minScore > 0) filters.scoreMin = minScore;
  if (args.sort && args.sort !== 'top_rated') filters.sort = args.sort;
  return { filters, unknownFilters };
}

async function findMovie({ movie_id, title } = {}, movieService) {
  if (movie_id) {
    const movie = await movieService.getById(movie_id).catch(() => null);
    if (movie && !movie.isHidden) return movie;
  }
  const keyword = title || movie_id;
  if (!keyword) return null;
  const { data = [] } = await movieService.search(keyword, { limit: 3 });
  // Search rows are projected (no content/actors, maybe no isHidden): load the full doc.
  for (const hit of data) {
    const movie = await movieService.getById(String(hit.id || hit._id)).catch(() => null);
    if (movie && !movie.isHidden) return movie;
  }
  return null;
}

const handlers = {
  async search_movies(args, deps, userId, shownIds) {
    const { filters, unknownFilters } = await searchFilters(args, deps.movieService);
    const extra = unknownFilters.length ? { unknownFilters } : {};
    // Keyword search: the user asked for a specific title, return it even if already watched.
    if (args.query) {
      // Over-fetch: search/getAll do not drop hidden movies, toMovieCard does.
      const { data = [] } = await deps.movieService.search(args.query, { ...filters, limit: MAX_RESULTS * 2 });
      return moviesResult(data, extra, { count: countOf(args) });
    }
    const [{ data = [] }, { skip, block }] = await Promise.all([
      deps.movieService.search('', { ...filters, limit: POOL_SIZE }),
      seenIds(userId, deps, shownIds),
    ]);
    const maxMinutes = parseInt(args.max_minutes, 10);
    let list = data.filter((m) => m.status !== 'upcoming');
    // Unknown runtime ("N/A") counts as too long: the user set a time budget.
    if (maxMinutes > 0) list = list.filter((m) => (minutesOf(m.duration || m.time) || Infinity) <= maxMinutes);
    if (args.sort === 'top_rated') list = [...list].sort((a, b) => (b.tmdb?.vote_average || 0) - (a.tmdb?.vote_average || 0));
    return { ...moviesResult(list, extra, { skip, block, count: countOf(args) }), nextSteps: NEXT_STEPS };
  },

  async get_movie_details(args, { movieService, tmdb }) {
    const movie = await findMovie(args, movieService);
    if (!movie) return NOT_FOUND;
    const card = toMovieCard(movie);
    // TMDB is optional enrichment: a miss or outage still answers from the DB fields.
    const extra = tmdb && movie.tmdb?.id ? await tmdb.getMovieDetailsForChat(movie.tmdb.id, movie.tmdb.type) : null;
    return {
      result: {
        ...brief(card),
        description: stripHtml(movie.description).slice(0, 700),
        actors: names(movie.actors).slice(0, 6),
        directors: names(movie.directors).slice(0, 3),
        country: names(movie.country),
        status: movie.status,
        totalEpisodes: movie.totalEpisodes,
        ...(extra && { tmdb: extra }),
      },
      movies: [card],
    };
  },

  async recommend_movies(args, deps, userId, shownIds) {
    const { movieService } = deps;
    const n = MAX_RESULTS * 4; // room for the already-seen skip
    if (args.source === 'for_me' && !userId) return LOGIN_REQUIRED;
    const base = args.source === 'similar' ? await findMovie(args, movieService) : null;
    if (args.source === 'similar' && !base) return NOT_FOUND;
    const list = {
      for_me: () => movieService.getForYou(userId, n),
      similar: () => movieService.getRecommendations(base.id, n),
      top_rated: () => movieService.getTopRated(n),
      new: () => movieService.getNewReleases(n),
    }[args.source] || (() => movieService.getTrending(n));
    const [{ data = [] }, { skip, block }] = await Promise.all([list(), seenIds(userId, deps, shownIds)]);
    if (base) skip.add(String(base.id));
    // One "why" line per card; for_me rows bring their own from getForYou.
    const reason = args.source === 'for_me' ? undefined
      : { similar: `Giống ${base?.title}`, top_rated: 'Được đánh giá cao', new: 'Mới ra mắt' }[args.source] || 'Đang thịnh hành';
    const rows = reason ? data.map((m) => ({ ...m, reason })) : data;
    return { ...moviesResult(rows, base ? { similarTo: base.title } : {}, { skip, block, count: countOf(args) }), nextSteps: NEXT_STEPS };
  },

  async get_my_library({ list }, { models }, userId) {
    if (!userId) return LOGIN_REQUIRED;
    const Model = { history: models.UserHistory, favorites: models.UserFavorite, watchlist: models.UserWatchlist }[list];
    if (!Model) return { result: { error: 'invalid_list' } };
    const rows = await Model.find({ userId })
      .sort(list === 'history' ? { lastWatchedAt: -1 } : { createdAt: -1 })
      .limit(MAX_RESULTS * 2)
      .populate('movieId')
      .lean();
    const movies = rows.filter((r) => r.movieId).map((r) => ({ ...r.movieId, progress: r.progress }));
    return moviesResult(movies, { list });
  },

  async add_to_watchlist(args, { movieService, models, questService }, userId) {
    if (!userId) return LOGIN_REQUIRED;
    const movie = await findMovie(args, movieService);
    if (!movie) return NOT_FOUND;
    const card = toMovieCard(movie);
    let alreadyInList = false;
    try {
      await models.UserWatchlist.create({ userId, movieId: card.id });
      // Same side effect as POST /users/watchlist.
      questService?.checkAndUpdateProgress(userId, { type: 'watchlist', movieId: card.id }).catch(() => {});
    } catch (error) {
      if (error.code !== 11000) throw error;
      alreadyInList = true;
    }
    return { result: { ok: true, alreadyInList, movie: brief(card) }, movies: [card] };
  },

  async open_movie(args, { movieService }) {
    const movie = await findMovie(args, movieService);
    if (!movie) return NOT_FOUND;
    const card = toMovieCard(movie);
    const path = `/${args.mode === 'watch' ? 'watch' : 'movie'}/${card.id}`;
    return { result: { ok: true, opened: brief(card) }, movies: [card], action: { type: 'navigate', path } };
  },

  async update_memory({ action, note }, { models }, userId) {
    if (!userId) return LOGIN_REQUIRED;
    if (action === 'clear') {
      await models.User.updateOne({ _id: userId }, { $set: { chatMemory: [] } });
      return { result: { ok: true, cleared: true } };
    }
    const text = stripHtml(note).slice(0, 200);
    if (!text) return { result: { error: 'empty_note' } };
    await models.User.updateOne({ _id: userId }, { $push: { chatMemory: { $each: [text], $slice: -MAX_MEMORY } } });
    return { result: { ok: true, remembered: text } };
  },

  async suggest_replies({ options }) {
    const list = [...new Set([].concat(options ?? []).map((o) => stripHtml(o).slice(0, MAX_REPLY_CHARS)).filter(Boolean))]
      .slice(0, MAX_REPLIES);
    return { result: { ok: true, shown: list }, suggestions: list };
  },
};

// Lazy so tests can inject fakes without loading Mongo/Redis-backed modules.
function defaultDeps() {
  return {
    movieService: require('../movie.service'),
    questService: require('../quest.service'),
    tmdb: require('../../integrations/tmdb.service'),
    models: {
      User: require('../../models/user.model'),
      UserHistory: require('../../models/user_history.model'),
      UserFavorite: require('../../models/user_favorite.model'),
      UserWatchlist: require('../../models/user_watchlist.model'),
    },
  };
}

// shownIds: movie ids already suggested in this chat session (not repeated by discovery tools).
async function executeTool(name, args, { userId = null, deps, shownIds = [] } = {}) {
  const handler = handlers[name];
  if (!handler) return { result: { error: `unknown_tool: ${name}` } };
  try {
    return await handler(args || {}, deps || defaultDeps(), userId, shownIds);
  } catch (error) {
    console.error(`[chat] tool ${name} failed:`, error.message);
    return { result: { error: 'tool_failed', message: 'Công cụ tạm thời lỗi, hãy trả lời dựa trên thông tin đang có.' } };
  }
}

// Personal context for the system prompt. Null for guests or on failure.
async function loadUserProfile(userId, deps = defaultDeps()) {
  if (!userId) return null;
  const { User, UserHistory, UserFavorite } = deps.models;
  const { isPremiumActive } = require('../premium.service');
  try {
    const [user, history, favorites] = await Promise.all([
      User.findById(userId).select('username role premiumPlan premiumExpiresAt watchStreak chatMemory').lean(),
      UserHistory.find({ userId }).sort({ lastWatchedAt: -1 }).limit(8).populate('movieId', 'name categories isHidden').lean(),
      UserFavorite.find({ userId }).sort({ createdAt: -1 }).limit(5).populate('movieId', 'name isHidden').lean(),
    ]);
    if (!user) return null;
    const watched = history.map((h) => h.movieId).filter((m) => m && !m.isHidden);
    const genreCount = {};
    watched.forEach((m) => names(m.categories).forEach((g) => (genreCount[g] = (genreCount[g] || 0) + 1)));
    return {
      name: user.username,
      isPremium: isPremiumActive(user),
      watchStreak: user.watchStreak || 0,
      topGenres: Object.keys(genreCount).sort((a, b) => genreCount[b] - genreCount[a]).slice(0, 4),
      recentTitles: [...new Set(watched.map((m) => m.name))].slice(0, 5),
      favoriteTitles: favorites.map((f) => f.movieId).filter((m) => m && !m.isHidden).map((m) => m.name),
      memory: user.chatMemory || [],
    };
  } catch (error) {
    console.error('[chat] loadUserProfile failed:', error.message);
    return null;
  }
}

// The movie the user is on (from page metadata) so "phim này" resolves.
async function loadCurrentMovie(movieId, deps = defaultDeps()) {
  if (!/^[a-f0-9]{24}$/i.test(String(movieId || ''))) return null;
  const movie = await deps.movieService.getById(movieId).catch(() => null);
  const card = toMovieCard(movie);
  return card && { id: card.id, title: card.title, year: card.year };
}

module.exports = { TOOLS, executeTool, loadUserProfile, loadCurrentMovie, toMovieCard, matchSlug, fold };
