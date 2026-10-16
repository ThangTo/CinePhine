// Tools the chat agent can call (OpenAI function format; the Gemini provider maps it).
// executeTool returns { result, movies, action }: `result` goes back to the LLM,
// `movies` / `action` go straight to the UI.

const MAX_RESULTS = 6;
const MAX_MEMORY = 20;
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
  fn('search_movies', 'Tìm phim theo tên/từ khóa và/hoặc lọc theo thể loại, quốc gia, loại phim, năm.', {
    query: { type: 'string', description: 'Tên phim hoặc từ khóa; bỏ trống nếu chỉ lọc' },
    genre: { type: 'string', description: 'Thể loại, vd "hành động", "kinh dị"' },
    country: { type: 'string', description: 'Quốc gia, vd "Hàn Quốc", "Nhật Bản"' },
    type: {
      type: 'string',
      enum: ['single', 'series', 'hoathinh', 'tvshows'],
      description: 'single=phim lẻ, series=phim bộ, hoathinh=hoạt hình, tvshows=TV show',
    },
    year: { type: 'integer' },
    sort: { type: 'string', enum: ['newest', 'imdb', 'views'], description: 'newest=mới, imdb=điểm cao, views=xem nhiều' },
  }),
  fn(
    'get_movie_details',
    'Lấy chi tiết một phim: nội dung, tagline, từ khóa, thời lượng, diễn viên kèm vai, đạo diễn, số tập, vài review (TMDB).',
    movieRef,
  ),
  fn(
    'recommend_movies',
    'Gợi ý phim KHÔNG kèm bộ lọc. Nếu người dùng nêu thể loại/quốc gia/loại phim/năm thì dùng search_movies. for_me=theo gu người dùng (cần đăng nhập), similar=giống một phim, trending=đang hot, top_rated=điểm cao, new=mới ra.',
    { source: { type: 'string', enum: ['for_me', 'similar', 'trending', 'top_rated', 'new'] }, ...movieRef },
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
    rating: m.imdb || m.rating || 0,
    genres: names(m.genres || m.categories).slice(0, 3),
    ...(m.progress != null ? { progress: m.progress } : {}),
  };
}

// What the LLM sees: no image URLs, saves tokens.
const brief = ({ poster, thumb, slug, id, ...rest }) => ({ movie_id: id, ...rest });

function moviesResult(list = [], extra = {}) {
  const seen = new Set();
  const movies = list
    .map(toMovieCard)
    .filter((c) => c && !seen.has(c.id) && seen.add(c.id))
    .slice(0, MAX_RESULTS);
  return { result: { count: movies.length, movies: movies.map(brief), ...extra }, movies };
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
  async search_movies(args, { movieService }) {
    const { genres = [], countries = [] } = (await movieService.getFilterOptions().catch(() => null)) || {};
    const filters = {};
    const unknownFilters = [];
    for (const [key, options] of [['genre', genres], ['country', countries]]) {
      if (!args[key]) continue;
      const slug = matchSlug(options, args[key]);
      if (slug) filters[key] = slug;
      else unknownFilters.push(args[key]);
    }
    if (args.type) filters.type = args.type;
    if (parseInt(args.year, 10)) filters.year = parseInt(args.year, 10);
    if (args.sort) filters.sort = args.sort;
    // Over-fetch: search/getAll do not drop hidden movies, toMovieCard does.
    const { data = [] } = await movieService.search(args.query || '', { ...filters, limit: MAX_RESULTS * 2 });
    return moviesResult(data, unknownFilters.length ? { unknownFilters } : {});
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

  async recommend_movies(args, { movieService }, userId) {
    const n = MAX_RESULTS * 2;
    if (args.source === 'for_me') {
      if (!userId) return LOGIN_REQUIRED;
      return moviesResult((await movieService.getForYou(userId, n)).data);
    }
    if (args.source === 'similar') {
      const base = await findMovie(args, movieService);
      if (!base) return NOT_FOUND;
      return moviesResult((await movieService.getRecommendations(base.id, n)).data, { similarTo: base.title });
    }
    const list = {
      top_rated: () => movieService.getTopRated(n),
      new: () => movieService.getNewReleases(n),
    }[args.source] || (() => movieService.getTrending(n));
    return moviesResult((await list()).data);
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

async function executeTool(name, args, { userId = null, deps } = {}) {
  const handler = handlers[name];
  if (!handler) return { result: { error: `unknown_tool: ${name}` } };
  try {
    return await handler(args || {}, deps || defaultDeps(), userId);
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
