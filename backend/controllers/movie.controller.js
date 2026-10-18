const movieService = require('../services/movie.service');
const questService = require('../services/quest.service');
const playbackHeartbeatService = require('../services/playbackHeartbeat.service');
const trendingService = require('../services/trending.service');
const subtitleService = require('../services/subtitle.service');
const Episode = require('../models/episode.model');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { processM3u8StreamDirect, processM3u8StreamWithProxy } = require('../utils/m3u8Utils');
const { buildSourceHeaders, fetchWithIpv4 } = require('../utils/httpFetch');
const {
  buildProxyTsPolicyHeaders,
  getClientIp,
  getProxyTsPolicy,
} = require('../utils/proxyTsPolicy');

let activeDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = Math.max(
  1,
  Number.parseInt(process.env.MOBILE_DOWNLOAD_MAX_CONCURRENT || process.env.MAX_CONCURRENT_DOWNLOADS || '1', 10) || 1,
);
const TS_PROXY_TIMEOUT_MS = Math.max(10000, Number(process.env.TS_PROXY_TIMEOUT_MS || 30000));
const DOWNLOAD_M3U8_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.DOWNLOAD_M3U8_TIMEOUT_MS || 30000),
);
const PROXY_TS_MAX_ACTIVE_SESSIONS = Math.max(
  1,
  Number.parseInt(process.env.PROXY_TS_MAX_ACTIVE_SESSIONS || process.env.PROXY_TS_MAX_USERS || '3', 10) || 3,
);
const PROXY_TS_SESSION_TTL_MS = Math.max(
  30000,
  Number.parseInt(process.env.PROXY_TS_SESSION_TTL_MS, 10) || 90000,
);
const PROXY_TS_SESSION_ID_MAX_LENGTH = 120;
const proxyTsSessions = new Map();
const PROXY_TS_EXPOSED_HEADERS = [
  'X-Proxy-TS-Policy',
  'X-Proxy-TS-Country',
  'X-Proxy-TS-Reason',
  'X-Proxy-TS-Session',
  'X-Proxy-TS-Active-Sessions',
  'X-Proxy-TS-Max-Sessions',
].join(', ');
const PROXY_TS_VARY_HEADERS = [
  'CF-IPCountry',
  'X-Vercel-IP-Country',
  'X-Country-Code',
  'CF-Connecting-IP',
  'X-Real-IP',
  'X-Forwarded-For',
];
/**
 * Helper: Parse array query parameters (genres, countries)
 * @param {string|string[]} param - Query parameter value
 * @returns {string[]|undefined} Parsed array or undefined
 */
const parseArrayParam = (param) => {
  if (!param) return undefined;
  return Array.isArray(param) ? param : param.split(',').filter(Boolean);
};

const getRequestIpAddress = (req) => getClientIp(req) || '0.0.0.0';

function appendVaryHeader(res, values) {
  const existingValues = String(res.getHeader('Vary') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const merged = new Set([...existingValues, ...values]);
  res.setHeader('Vary', Array.from(merged).join(', '));
}

function setProxyTsPolicyHeaders(res, policyDecision) {
  const headers = buildProxyTsPolicyHeaders(policyDecision);
  Object.entries(headers).forEach(([name, value]) => {
    res.setHeader(name, value);
  });
  res.setHeader('Access-Control-Expose-Headers', PROXY_TS_EXPOSED_HEADERS);
  appendVaryHeader(res, PROXY_TS_VARY_HEADERS);
}

function normalizeProxyTsSessionId(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || '').trim();
  if (!normalized || normalized.length > PROXY_TS_SESSION_ID_MAX_LENGTH) {
    return null;
  }

  return /^[a-zA-Z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function createProxyTsSessionId(value) {
  return normalizeProxyTsSessionId(value) || crypto.randomUUID();
}

function addQueryParam(baseUrl, key, value) {
  try {
    const nextUrl = new URL(baseUrl);
    nextUrl.searchParams.set(key, value);
    return nextUrl.toString();
  } catch (_error) {
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function cleanupProxyTsSessions(now = Date.now()) {
  for (const [sessionId, session] of proxyTsSessions.entries()) {
    if ((session.activeRequests || 0) <= 0 && now - session.lastSeenAt > PROXY_TS_SESSION_TTL_MS) {
      proxyTsSessions.delete(sessionId);
    }
  }
}

function getProxyTsSessionKey(req) {
  return normalizeProxyTsSessionId(req.query.sid) || `ip:${getRequestIpAddress(req)}`;
}

function acquireProxyTsSession(req) {
  const now = Date.now();
  cleanupProxyTsSessions(now);

  const sessionId = getProxyTsSessionKey(req);
  let session = proxyTsSessions.get(sessionId);

  if (!session) {
    if (proxyTsSessions.size >= PROXY_TS_MAX_ACTIVE_SESSIONS) {
      return {
        allowed: false,
        activeSessions: proxyTsSessions.size,
        maxSessions: PROXY_TS_MAX_ACTIVE_SESSIONS,
      };
    }

    session = {
      id: sessionId,
      ipAddress: getRequestIpAddress(req),
      activeRequests: 0,
      createdAt: now,
      lastSeenAt: now,
    };
    proxyTsSessions.set(sessionId, session);
  }

  session.activeRequests += 1;
  session.lastSeenAt = now;

  return {
    allowed: true,
    id: sessionId,
    activeSessions: proxyTsSessions.size,
    maxSessions: PROXY_TS_MAX_ACTIVE_SESSIONS,
  };
}

function releaseProxyTsSession(sessionId) {
  if (!sessionId) return;

  const session = proxyTsSessions.get(sessionId);
  if (!session) return;

  session.activeRequests = Math.max(0, (session.activeRequests || 0) - 1);
  session.lastSeenAt = Date.now();
}

const isObjectId = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);

const resolveEpisodeForMovie = async (movieId, episodeParam) => {
  if (!movieId || !episodeParam) {
    return null;
  }

  if (isObjectId(episodeParam)) {
    const byObjectId = await Episode.findOne({ _id: episodeParam, movieId }).lean();
    if (byObjectId) {
      return byObjectId;
    }
  }

  const episodeNumber = Number.parseInt(episodeParam, 10);
  if (Number.isFinite(episodeNumber)) {
    const episodeCandidates = await Episode.find({ movieId, episodeId: episodeNumber })
      .sort({ _id: 1 })
      .lean();

    if (episodeCandidates.length === 1) {
      return episodeCandidates[0];
    }

    if (episodeCandidates.length > 1) {
      const preferredAudioOrder = ['vietsub', 'thuyet-minh', 'long-tieng'];
      for (const preferredAudio of preferredAudioOrder) {
        const matched = episodeCandidates.find(
          (candidate) => String(candidate.audioType || '').toLowerCase() === preferredAudio,
        );
        if (matched) {
          return matched;
        }
      }

      return episodeCandidates[0];
    }
  }

  return Episode.findOne({ movieId, slug: episodeParam }).lean();
};

const resolveMovieOrNull = async (identifier) => {
  try {
    return await movieService.getById(identifier);
  } catch (error) {
    if (error?.message === 'Movie not found') {
      return null;
    }
    throw error;
  }
};

const getOptionalUserId = (req) => {
  if (req.user && req.user._id) {
    return req.user._id;
  }

  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.replace('Bearer ', '')
      || req.cookies?.accessToken;

    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.userId || decoded.id || decoded._id || null;
  } catch (_error) {
    return null;
  }
};

/**
 * Helper: Build filters object from request query
 * @param {Object} req.query - Request query object
 * @returns {Object} Filters object
 */
const buildFiltersFromQuery = (query) => {
  const parsedGenres = parseArrayParam(query.genres);
  const parsedCountries = parseArrayParam(query.countries);
  const parsedYear = parseArrayParam(query.year);
  const parsedAgeRating = parseArrayParam(query.ageRating);
  const parsedLang = parseArrayParam(query.lang);

  return {
    ...(parsedGenres && { genres: parsedGenres }),
    ...(parsedCountries && { countries: parsedCountries }),
    ...(parsedYear && { year: parsedYear }),
    ...(query.yearFrom && { yearFrom: query.yearFrom }),
    ...(query.yearTo && { yearTo: query.yearTo }),
    ...(query.quality && { quality: query.quality }),
    ...(query.type && { type: query.type }),
    ...(query.subType && { subType: query.subType }),
    ...(parsedAgeRating && { ageRating: parsedAgeRating }),
    ...(query.status && { status: query.status }),
    ...(query.ratingMin && { ratingMin: query.ratingMin }),
    ...(query.ratingMax && { ratingMax: query.ratingMax }),
    ...(parsedLang && { lang: parsedLang }),
  };
};

/**
 * GET /movies
 * Get all movies with filters and pagination
 * @param {Object} req.query - { page?, limit?, genre?, country?, year?, sort? }
 * @returns {Object} { data: Array, pagination: Object }
 */
const getAll = async (req, res) => {
  try {
    const filters = buildFiltersFromQuery(req.query);

    const result = await movieService.getAll(filters, {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort || 'newest',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/:id
 * Get movie by ID (supports slug or ObjectId)
 * @param {string} req.params.id - Movie ID or slug
 * @returns {Object} Movie object
 */
const getById = async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = req.user?.role === 'admin';
    const movie = await movieService.getById(req.params.id, { isAdmin });
    res.json(movie);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// Public ranked lists: bounded limit (it is also part of the cache key), whitelisted type
const LIST_MAX_LIMIT = 50;
const parseListQuery = (query) => ({
  limit: Math.min(LIST_MAX_LIMIT, Math.max(1, Math.floor(Number(query.limit)) || 10)),
  type: ['single', 'series'].includes(query.type) ? query.type : undefined,
});

/**
 * GET /movies/trending/now
 * Get trending movies (recent unique viewers, decayed)
 * @param {number} req.query.limit - Limit number of results (default: 10, max: 50)
 * @param {string} req.query.type - Optional 'single' | 'series'
 * @param {string} req.query.featured - 'true' pins featured movies first (banner)
 * @returns {Object} { data: Array }
 */
const getTrending = async (req, res) => {
  try {
    const { limit, type } = parseListQuery(req.query);
    const result = await movieService.getTrending(limit, { type, featured: req.query.featured === 'true' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/top/rated
 * Get top rated movies
 * @param {number} req.query.limit - Limit number of results (default: 10)
 * @returns {Object} { data: Array }
 */
const getTopRated = async (req, res) => {
  try {
    const { limit, type } = parseListQuery(req.query);
    const result = await movieService.getTopRated(limit, { type });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/new/releases
 * Get latest movies
 * @param {number} req.query.limit - Limit number of results (default: 10)
 * @returns {Object} { data: Array }
 */
const getNewReleases = async (req, res) => {
  try {
    const { limit, type } = parseListQuery(req.query);
    const result = await movieService.getNewReleases(limit, { type });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/genre/:genre
 * Get movies filtered by genre
 * @param {string} req.params.genre - Genre
 * @param {Object} req.query - { page?, limit?, genres?, countries?, year?, yearFrom?, yearTo?, quality?, type?, ageRating?, status?, ratingMin?, ratingMax? }
 */
const getByGenre = async (req, res) => {
  try {
    const filters = {
      genre: req.params.genre,
      ...buildFiltersFromQuery(req.query),
    };
    const result = await movieService.getByGenre(req.params.genre, {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort || 'newest',
      ...filters,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/meta/filters
 * Get available genres & countries for filtering
 */
const getFilters = async (_req, res) => {
  try {
    const data = await movieService.getFilterOptions();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/meta/top-genres
 * Get top genres by total view count
 * @param {number} req.query.limit - Number of genres to return (default: 10)
 */
const getTopGenres = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const topGenres = await movieService.getTopGenresByViews(limit);
    res.json({ genres: topGenres });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/v1/movies/meta/theme
 * Get current theme setting (public endpoint)
 */
const getTheme = async (req, res) => {
  try {
    const adminService = require('../services/admin.service');
    const theme = await adminService.getTheme();
    res.json({ theme });
  } catch (error) {
    // Fallback to default if error
    res.json({ theme: 'default' });
  }
};

/**
 * GET /movies/country/:country
 * Get movies filtered by country
 * @param {string} req.params.country - country slug
 * @param {Object} req.query - { page?, limit?, genres?, countries?, year?, yearFrom?, yearTo?, quality?, type?, ageRating?, status?, ratingMin?, ratingMax? }
 */
const getByCountry = async (req, res) => {
  try {
    const filters = {
      country: req.params.country,
      ...buildFiltersFromQuery(req.query),
    };
    const result = await movieService.getByCountry(req.params.country, {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort || 'newest',
      ...filters,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/type/:type
 * Filter movies by type (single/series)
 * @param {Object} req.query - { page?, limit?, genres?, countries?, year?, yearFrom?, yearTo?, quality?, ageRating?, status?, ratingMin?, ratingMax? }
 */
const getByType = async (req, res) => {
  try {
    const typeParam = req.params.type;
    const allowed = ['single', 'series', 'hoathinh', 'tvshows'];
    if (!allowed.includes(typeParam)) {
      throw new Error('Invalid movie type. Use "single", "series", "hoathinh" or "tvshows"');
    }

    const baseFilters = buildFiltersFromQuery(req.query);
    const result = await movieService.getByType(typeParam, {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort || 'newest',
      type: typeParam,
      ...baseFilters,
    });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('Invalid movie type') ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};

/**
 * GET /movies/search/query
 * Search movies
 * @param {string} req.query.q - Search query
 * @param {Object} req.query - { page?, limit? }
 */
const search = async (req, res) => {
  try {
    const filters = buildFiltersFromQuery(req.query);

    const result = await movieService.search(req.query.q || '', {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort || 'newest',
      ...filters,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/:id/episodes
 * Get all episodes of a movie
 * @param {string} req.params.id - Movie ID or slug
 */
const getEpisodes = async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = req.user?.role === 'admin';
    const episodes = await movieService.getEpisodes(req.params.id, { isAdmin });
    res.json({ data: episodes });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * GET /movies/:id/cast
 * Get cast list
 * @param {string} req.params.id - Movie ID or slug
 */
const getCast = async (req, res) => {
  try {
    const cast = await movieService.getCast(req.params.id);
    res.json({ data: cast });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * GET /movies/:id/comments
 * Get comments with pagination
 * @param {string} req.params.id - Movie ID or slug
 * @param {Object} req.query - { page?, limit? }
 */
const getComments = async (req, res) => {
  try {
    const comments = await movieService.getComments(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(comments);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * POST /movies/:id/comments
 * Post comment (requires authentication)
 * @param {string} req.params.id - Movie ID or slug
 * @param {Object} req.body - { content, episodeId? }
 * @param {Object} req.user - Authed user
 */
const postComment = async (req, res) => {
  try {
    const newComment = await movieService.postComment(
      req.params.id,
      req.user?._id || null,
      req.body,
    );
    res.status(201).json(newComment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /movies/:id/view
 * Increment view count for a movie (Anti-Spam: 2h cooldown per user/IP)
 * @param {string} req.params.id - Movie ID or slug
 */
const incrementView = async (req, res) => {
  try {
    const ipAddress = getRequestIpAddress(req);
    const userId = getOptionalUserId(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { episodeId } = req.body || {};

    const result = await movieService.incrementView(req.params.id, {
      episodeId,
      userId,
      ipAddress,
      userAgent
    });
    res.json(result);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * POST /movies/:id/watch-time
 * Record watch time heartbeat (called every 30s from frontend)
 * @param {string} req.params.id - Movie ID or slug
 * @param {string} req.body.viewHistoryId - ViewHistory record ID
 * @param {number} req.body.seconds - Seconds watched since last heartbeat (default 30)
 */
const recordWatchTime = async (req, res) => {
  try {
    const {
      viewHistoryId,
      episodeId = null,
      seconds = 30,
      watchTime = null,
      duration = null,
    } = req.body || {};
    const result = await playbackHeartbeatService.recordPlaybackHeartbeat(req.params.id, {
      viewHistoryId,
      episodeId,
      seconds,
      watchTime,
      duration,
      userId: getOptionalUserId(req),
      ipAddress: getRequestIpAddress(req),
      userAgent: req.headers['user-agent'] || 'Unknown',
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /movies/:id/rate
 * Rate movie (requires authentication)
 * @param {string} req.params.id - Movie ID or slug
 * @param {number} req.body.rating - 1-10
 */
const rateMovie = async (req, res) => {
  try {
    const result = await movieService.rateMovie(
      req.params.id,
      req.user?._id || null,
      req.body.rating,
    );
    res.json(result);

    // Quest progress: rating event (fire-and-forget)
    if (req.user?._id) {
      questService.checkAndUpdateProgress(req.user._id, { type: 'rating' }).catch(() => {});
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * GET /movies/:id/ratings
 * Get ratings list for a movie
 * @param {string} req.params.id - Movie ID or slug
 * @param {Object} req.query - { page?, limit? }
 */
const getRatings = async (req, res) => {
  try {
    const ratings = await movieService.getRatings(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(ratings);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * POST /comments/:commentId/like
 * Like a comment (requires authentication)
 * @param {string} req.params.commentId - Comment ID
 * @param {Object} req.body - { isCurrentlyLiked?: boolean, isCurrentlyDisliked?: boolean }
 * @param {Object} req.user - Authed user
 */
const likeComment = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await movieService.likeComment(
      req.params.commentId,
      req.user._id,
      req.body.isCurrentlyLiked || false,
      req.body.isCurrentlyDisliked || false,
    );
    res.json(result);
  } catch (error) {
    console.error('[Like Comment] Error:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ message: error.message });
  }
};

/**
 * POST /comments/:commentId/dislike
 * Dislike a comment (requires authentication)
 * @param {string} req.params.commentId - Comment ID
 * @param {Object} req.body - { isCurrentlyDisliked?: boolean, isCurrentlyLiked?: boolean }
 * @param {Object} req.user - Authed user
 */
const dislikeComment = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await movieService.dislikeComment(
      req.params.commentId,
      req.user._id,
      req.body.isCurrentlyDisliked || false,
      req.body.isCurrentlyLiked || false,
    );
    res.json(result);
  } catch (error) {
    console.error('[Dislike Comment] Error:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ message: error.message });
  }
};

/**
 * DELETE /comments/:commentId
 * Delete a comment (requires authentication)
 * Only the comment owner can delete their own comment
 * @param {string} req.params.commentId - Comment ID
 * @param {Object} req.user - Authed user
 */
const deleteComment = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await movieService.deleteComment(req.params.commentId, req.user._id);
    res.json(result);
  } catch (error) {
    console.error('[Delete Comment] Error:', error);
    const statusCode = error.message.includes('not found')
      ? 404
      : error.message.includes('only delete')
      ? 403
      : 400;
    res.status(statusCode).json({ message: error.message });
  }
};

/**
 * GET /movies/:id/recommendations
 * Get recommended movies based on a movie
 * @param {string} req.params.id - Movie ID or slug
 * @param {number} req.query.limit - Limit number of results (default: 10)
 * @returns {Object} { data: Array }
 */
const getRecommendations = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const result = await movieService.getRecommendations(req.params.id, limit);

    res.json(result);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * GET /movies/for-you
 * Get personalized movie recommendations based on user's watch history
 * Requires authentication
 * @param {number} req.query.limit - Limit number of results (default: 20)
 * @returns {Object} { data: Array }
 */
const getForYou = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Clamped: limit picks the per-user cache bucket and sizes the $search pipeline
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit)) || 20));
    const result = await movieService.getForYou(req.user._id, limit);

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /movies/proxy-m3u8
 * Proxy M3U8 stream to filter out advertisements
 * @param {string} req.query.url - Target M3U8 URL
 * @param {string} req.query.mode - 'direct' (default) or 'proxy'
 */
const proxyM3u8 = async (req, res) => {
  try {
    const { url, mode } = req.query;
    if (!url) {
      return res.status(400).send('Missing url parameter');
    }

    const requestedMode = mode === 'proxy' ? 'proxy' : 'direct';
    const proxyTsPolicy = getProxyTsPolicy(req);
    setProxyTsPolicyHeaders(res, proxyTsPolicy);

    // Build proxy base URLs from request
    const forwardedProto = req.headers['x-forwarded-proto'];
    const host = req.get('host');
    let protocol = forwardedProto || req.protocol;
    
    if (protocol === 'http' && host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      protocol = 'https';
    }
    
    const proxyBase = `${protocol}://${host}${req.baseUrl || ''}/proxy-m3u8`;
    const tsProxyBase = `${protocol}://${host}${req.baseUrl || ''}/proxy-ts`;

    let cleanContent;
    if (requestedMode === 'proxy' && proxyTsPolicy.allowed) {
      const proxyTsSessionId = createProxyTsSessionId(req.query.sid);
      const proxyBaseWithSession = addQueryParam(proxyBase, 'sid', proxyTsSessionId);
      const tsProxyBaseWithSession = addQueryParam(tsProxyBase, 'sid', proxyTsSessionId);
      cleanContent = await processM3u8StreamWithProxy(url, proxyBaseWithSession, tsProxyBaseWithSession);
      res.setHeader('X-Proxy-TS-Session', proxyTsSessionId);
    } else {
      cleanContent = await processM3u8StreamDirect(url, proxyBase);
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(cleanContent);
  } catch (error) {
    console.error('[proxyM3u8] Error:', error.message);
    res.status(500).send('Error processing M3U8 stream');
  }
};

/**
 * GET /movies/proxy-ts
 * Proxy TS segment requests to hide client IP from source server
 * @param {string} req.query.url - Target TS segment URL
 */
const proxyTs = async (req, res) => {
  const upstreamController = new AbortController();
  const abortUpstream = () => upstreamController.abort();
  let proxyTsSession = null;

  req.on('close', abortUpstream);
  res.on('close', abortUpstream);

  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('Missing url parameter');
    }

    // Do NOT forward Range headers from client — TS segments are complete files
    const proxyTsPolicy = getProxyTsPolicy(req);
    setProxyTsPolicyHeaders(res, proxyTsPolicy);
    if (!proxyTsPolicy.allowed) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(403).send('proxy-ts is not available for this location.');
    }

    proxyTsSession = acquireProxyTsSession(req);
    if (!proxyTsSession.allowed) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Retry-After', '30');
      res.setHeader('X-Proxy-TS-Active-Sessions', String(proxyTsSession.activeSessions));
      res.setHeader('X-Proxy-TS-Max-Sessions', String(proxyTsSession.maxSessions));
      return res.status(429).send('Too many proxy-ts sessions. Please try again later.');
    }

    const response = await fetchWithIpv4(url, {
      headers: buildSourceHeaders(url),
      timeoutMs: TS_PROXY_TIMEOUT_MS,
      signal: upstreamController.signal,
    });

    if (!response.ok) {
      console.error(`[proxyTs] Fetch failed: ${response.status} ${response.statusText}`);
      return res.status(502).send('Failed to fetch segment from source');
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Proxy-TS-Active-Sessions', String(proxyTsSession.activeSessions));
    res.setHeader('X-Proxy-TS-Max-Sessions', String(proxyTsSession.maxSessions));
    res.setHeader('X-Proxy-TS-Session', proxyTsSession.id);

    if (!response.body) {
      return res.status(502).send('Failed to fetch segment from source');
    }

    response.body.pipe(res);

    // Handle stream errors gracefully
    response.body.on('error', (err) => {
      console.error('[proxyTs] Stream error:', err.message);
      if (!res.headersSent) {
        res.status(502).send('Stream error');
      } else {
        res.end();
      }
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('[proxyTs] Error:', error.message);
    }

    if (!res.headersSent && error.name !== 'AbortError') {
      res.status(500).send('Error fetching TS segment');
    }
  } finally {
    if (proxyTsSession?.allowed) {
      releaseProxyTsSession(proxyTsSession.id);
    }
    req.off('close', abortUpstream);
    res.off('close', abortUpstream);
  }
};

/**
 * GET /movies/download
 * Download movie directly to an MP4 file using FFmpeg, bypassing ads.
 * @param {string} req.query.url - Target M3U8 URL
 * @param {string} req.query.filename - Desired output filename
 */
const downloadMovie = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    let currentUrl = url;
    let response = await fetchWithIpv4(currentUrl, {
      headers: buildSourceHeaders(currentUrl),
      timeoutMs: DOWNLOAD_M3U8_TIMEOUT_MS,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch M3U8: ${response.statusText}`);
    }
    let content = await response.text();

    // 1. If Master Playlist, get highest quality Media Playlist
    if (content.includes('#EXT-X-STREAM-INF')) {
      const lines = content.split('\n');
      let maxBandwidth = 0;
      let bestUri = '';

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('BANDWIDTH=')) {
          const match = lines[i].match(/BANDWIDTH=(\d+)/);
          const bandwidth = match ? parseInt(match[1]) : 0;
          if (lines[i + 1] && bandwidth > maxBandwidth) {
            maxBandwidth = bandwidth;
            bestUri = lines[i + 1].trim();
          }
        }
      }

      if (bestUri) {
        currentUrl = new URL(bestUri, currentUrl).toString();
        response = await fetchWithIpv4(currentUrl, {
          headers: buildSourceHeaders(currentUrl, { 'User-Agent': 'Mozilla/5.0' }),
          timeoutMs: DOWNLOAD_M3U8_TIMEOUT_MS,
        });
        content = await response.text();
      }
    }

    // 2. Process Media Playlist (Filter ads & make URLs absolute)
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    const AD_KEYWORDS = ['/v7/', '/adjump/', 'google', 'ads', 'doubleclick', 'facebook'];
    const lines = content.split('\n');
    const segments = [];
    let skipNext = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF')) {
        const nextLine = (lines[i + 1] || '').trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const isAd = AD_KEYWORDS.some((k) => nextLine.includes(k));
          if (isAd) {
            skipNext = true;
            continue;
          }
        }
      }

      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (line.includes('#EXT-X-DISCONTINUITY')) continue;

      if (!line.startsWith('#')) {
        if (!line.startsWith('http')) {
          line = new URL(line, baseUrl).toString();
        }
        if (line.includes('convertv7/')) {
          line = line.replace('convertv7/', '');
        }
        segments.push(line);
      }
    }

    res.json({ segments });

  } catch (error) {
    console.error('[downloadMovie] Error:', error.message);
    res.status(500).json({ error: 'Error processing download request' });
  }
};

/**
 * Handle Desktop / Mobile Video Segment TS generation (For Mobile Fallback)
 * @param {string} req.query.url - Link M3U8
 * @param {string} req.query.filename - Desired output filename
 */
const downloadMovieMobile = async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) {
      return res.status(400).send('Missing url parameter');
    }

    // 1. Kiểm tra giới hạn người tải cùng lúc
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      console.warn(`[Mobile Download] TỪ CHỐI TẢI do vượt quá giới hạn concurrent (${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS})`);
      return res.status(429).send('Server đang có quá nhiều yêu cầu tải phim cùng lúc. Vui lòng thử lại sau vài phút!');
    }

    // Nếu chỉ là request Ping kiểm tra slot trống từ trình duyệt (Pre-flight check)
    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    // Tăng count khi có người vào luồng
    activeDownloads++;
    req.setTimeout(0); // Vô hiệu hoá Time-out

    const localPort = req.socket.localPort || process.env.PORT || 5000;
    const protocol = req.protocol === 'https' ? 'https' : 'http';
    const proxyUrl = `${protocol}://127.0.0.1:${localPort}/api/v1/movies/proxy-m3u8?url=${encodeURIComponent(url)}&mode=proxy`;

    const finalFilename = filename ? `${filename}.mp4` : `CinePhine_Movie_${Date.now()}.mp4`;

    // Cài đặt Response Headers để rủ trình duyệt Tải về dạng Dòng Chảy (Stream)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFilename)}"`);
    res.setHeader('Content-Type', 'video/mp4');

    console.log(`[Mobile Download] Chấp nhận kết nối (${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS}). Đang Stream trực tiếp ra HTTP...`);

    let isAborted = false;

    // Chạy Engine FFmpeg để Multiplex video
    const command = ffmpeg(proxyUrl)
      .inputOptions([
        '-protocol_whitelist file,http,https,tcp,tls,crypto',
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n'
      ])
      .outputOptions([
        '-c copy',             // Copy video/audio, no re-encoding
        '-bsf:a aac_adtstoasc',// Sửa lỗi AAC Audio bị gãy
        '-f mp4',              // Định dạng MP4 container
        '-movflags frag_keyframe+empty_moov' // STREAMING CHUNKED MP4: Cho phép ghi MP4 không cần đợi kết thúc
      ])
      .on('error', (err) => {
        if (isAborted) {
          console.log('[Mobile Download] Đã huỷ tiến trình FFmpeg an toàn do User ngắt kết nối sớm.');
        } else {
          console.error('[Mobile Download] FFmpeg Error:', err.message);
          if (!res.headersSent) {
             res.status(500).send('Lỗi trong quá trình tạo video (FFmpeg Server Error)');
          } else {
             res.end(); // Kết thúc stream lỗi để tránh treo tab Client
          }
        }
        activeDownloads = Math.max(0, activeDownloads - 1);
      })
      .on('end', () => {
        if (isAborted) return;
        console.log(`[Mobile Download] Nén và Stream xong MP4! Active: ${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS}`);
        activeDownloads = Math.max(0, activeDownloads - 1);
      });

    // Bơm thẳng dữ liệu từ FFmpeg qua HTTP Response về điện thoại người dùng (ZERO-DISK)
    command.pipe(res, { end: true });

    // Phòng hộ: Nếu người dùng ngắt kết nối (tắt tab) TRƯỚC khi FFmpeg nén xong
    req.on('close', () => {
      // Nếu file MP4 chưa kịp gửi ra ngoài (nghĩa là connection bị drop lúc ffmpeg đang chạy)
      if (!res.writableEnded) {
        console.warn(`[Mobile Download] Khách hàng ngắt kết nối sớm. Đang Dừng khẩn cấp FFmpeg...`);
        isAborted = true;
        command.kill('SIGKILL'); // Bóp cổ Fire sự kiện .on('error') ở trên
      }
    });

  } catch (error) {
    console.error('[Mobile Download] Ngoại lệ rớt Error Catch:', error.message);
    activeDownloads = Math.max(0, activeDownloads - 1);
    if (!res.headersSent) {
      res.status(500).send('Error processing download request');
    } else {
      res.end();
    }
  }
};

/**
 * GET /api/v1/movies/trending-social
 * Get AI-curated trending movies (Dual-Source: TMDB + Google Trends)
 */
const getTrendingSocial = async (req, res) => {
  try {
    const movies = await trendingService.getTrendingSocial();
    res.json({ success: true, data: movies });
  } catch (error) {
    console.error('Error in getTrendingSocial:', error);
    res.status(500).json({ success: false, message: 'Không thể lấy danh sách phim trending.' });
  }
};

/**
 * GET /api/v1/movies/:id/episodes/:episodeId/subtitles/korean/status
 * Check if AI-generated source-language subtitles are available for an episode.
 * The route name is kept for backward compatibility with the current frontend.
 */
const getKoreanSubtitleStatus = async (req, res) => {
  try {
    const { id, episodeId } = req.params;
    
    const movie = await resolveMovieOrNull(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    
    const movieId = movie.id || movie._id;
    const episode = await resolveEpisodeForMovie(movieId, episodeId);
    if (!episode) {
      return res.status(404).json({ success: false, message: 'Episode not found' });
    }
    
    const m3u8Url = episode.link_m3u8;
    if (!m3u8Url) {
      return res.status(404).json({ success: false, message: 'No M3U8 URL found' });
    }
    
    const subtitleCacheIdentity = episode?._id
      ? `episode:${String(episode._id)}`
      : `movie:${String(movieId)}:episode:${String(episodeId)}`;

    const status = await subtitleService.getSubtitleStatus(
      m3u8Url,
      subtitleService.DEFAULT_SUBTITLE_LANGUAGE,
      subtitleCacheIdentity,
    );
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Error in getKoreanSubtitleStatus:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v1/movies/:id/episodes/:episodeId/subtitles/korean/request
 * Request Korean subtitles for an episode
 */
const requestKoreanSubtitles = async (req, res) => {
  try {
    const { id, episodeId } = req.params;
    
    const movie = await resolveMovieOrNull(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    
    const movieId = movie.id || movie._id;
    const episode = await resolveEpisodeForMovie(movieId, episodeId);
    if (!episode) {
      return res.status(404).json({ success: false, message: 'Episode not found' });
    }
    
    if (episode._id) {
      await Episode.findByIdAndUpdate(episode._id, { $inc: { subtitleRequestCount: 1 } });
    }
    
    res.json({ success: true, message: 'Subtitle request recorded' });
  } catch (error) {
    console.error('Error in requestKoreanSubtitles:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v1/movies/:id/episodes/:episodeId/subtitles/korean/generate
 * Generate AI source-language subtitles for an episode.
 * The route name is kept for backward compatibility with the current frontend.
 */
const generateKoreanSubtitles = async (req, res) => {
  try {
    const { id, episodeId } = req.params;
    
    const movie = await resolveMovieOrNull(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    
    const movieId = movie.id || movie._id;
    const episode = await resolveEpisodeForMovie(movieId, episodeId);
    if (!episode) {
      return res.status(404).json({ success: false, message: 'Episode not found' });
    }
    
    const m3u8Url = episode.link_m3u8;
    if (!m3u8Url) {
      return res.status(404).json({ success: false, message: 'No M3U8 URL found' });
    }
    
    const localPort = process.env.PORT || 5000;
    const protocol = req.protocol === 'https' ? 'https' : 'http';
    const proxyM3u8Url = `${protocol}://127.0.0.1:${localPort}/api/v1/movies/proxy-m3u8?url=${encodeURIComponent(m3u8Url)}&mode=proxy`;
    const subtitleCacheIdentity = episode?._id
      ? `episode:${String(episode._id)}`
      : `movie:${String(movieId)}:episode:${String(episodeId)}`;

    const result = await subtitleService.requestKoreanSubtitleGeneration(
      m3u8Url,
      proxyM3u8Url,
      undefined,
      subtitleCacheIdentity,
      subtitleService.DEFAULT_SUBTITLE_LANGUAGE,
    );
    if (result.status === 'ready') {
      return res.json({ success: true, ...result });
    }

    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error('Error in generateKoreanSubtitles:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAll,
  getById,
  getTrending,
  getTopRated,
  getNewReleases,
  getByGenre,
  getByCountry,
  getByType,
  getFilters,
  getTopGenres,
  getTheme,
  search,
  getEpisodes,
  getCast,
  getComments,
  postComment,
  rateMovie,
  getRatings,
  incrementView,
  recordWatchTime,
  likeComment,
  dislikeComment,
  deleteComment,
  getRecommendations,
  getEpisodes,
  proxyM3u8,
  proxyTs,
  downloadMovie,
  downloadMovieMobile,
  getCast,
  getForYou,
  getTrendingSocial,
  getKoreanSubtitleStatus,
  requestKoreanSubtitles,
  generateKoreanSubtitles,
};
