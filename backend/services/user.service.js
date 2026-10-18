const UserHistory = require('../models/user_history.model');
const User = require('../models/user.model');
const Movie = require('../models/movie.model');
const { transformMovie } = require('../utils/movieTransformer');

/**
 * Transform a single history item
 * @param {Object} item - History item (Mongoose document or plain object)
 * @returns {Object} Transformed history item
 */
const transformHistoryItem = (item) => {
  if (!item) return null;

  const itemObj = item.toObject ? item.toObject({ versionKey: false }) : item;

  // Transform movieId nếu có
  if (itemObj.movieId) {
    itemObj.movieId = transformMovie(itemObj.movieId);
  }

  // Transform episodeId: _id -> id
  if (itemObj.episodeId) {
    const episode = itemObj.episodeId.toObject
      ? itemObj.episodeId.toObject({ versionKey: false })
      : itemObj.episodeId;
    itemObj.episodeId = {
      ...episode,
      id: episode._id?.toString() || episode.id,
    };
    delete itemObj.episodeId._id;
  }

  // Transform history item _id -> id
  const transformed = {
    ...itemObj,
    id: itemObj._id?.toString() || itemObj.id,
  };
  delete transformed._id;
  return transformed;
};

/**
 * Transform an array of history items
 * @param {Array} items - Array of history items
 * @returns {Array} Array of transformed history items
 */
const transformHistoryItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map(transformHistoryItem).filter(Boolean);
};
/**
 * Add movie to favorites
 * @param {string|number} userId - User ID
 * @param {string|number} movieId - Movie ID
 * @returns {Promise<Object>} { message: string }
 */
const addToFavorites = async (movieId) => {
  // TODO: Implement
};

/**
 * Remove movie from favorites
 * @param {string|number} userId - User ID
 * @param {string|number} movieId - Movie ID
 * @returns {Promise<Object>} { message: string }
 */
const removeFromFavorites = async (movieId) => {
  // TODO: Implement
};

/**
 * Get favorites list
 * @param {string|number} userId - User ID
 * @param {Object} filters - { page?, limit? }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const getFavorites = async (filters) => {
  // TODO: Implement
};

/**
 * Add movie to watchlist
 * @param {string|number} userId - User ID
 * @param {string|number} movieId - Movie ID
 * @returns {Promise<Object>} { message: string }
 */
const addToWatchlist = async (movieId) => {
  // TODO: Implement
};

/**
 * Remove movie from watchlist
 * @param {string|number} userId - User ID
 * @param {string|number} movieId - Movie ID
 * @returns {Promise<Object>} { message: string }
 */
const removeFromWatchlist = async (movieId) => {
  // TODO: Implement
};

/**
 * Get watchlist
 * @param {string|number} userId - User ID
 * @param {Object} filters - { page?, limit? }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const getWatchlist = async (filters) => {
  // TODO: Implement
};

/**
 * Get watch history
 * @param {string|number} userId - User ID
 * @param {Object} filters - { page?, limit? }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const getHistory = async (userId, { page = 1, limit = 10 }) => {
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  const skip = (pageNum - 1) * limitNum;

  const [history, total] = await Promise.all([
    UserHistory.find({ userId })
      .sort({ lastWatchedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('movieId', 'name original_name slug thumb_url poster_url durationMinutes')
      .populate('episodeId', 'name slug filename episodeId audioType'),
    UserHistory.countDocuments({ userId }),
  ]);

  return {
    data: transformHistoryItems(history),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * Get continue watching list (phim đang xem tiếp)
 * @param {string|number} userId - User ID
 * @param {Object} filters - { page?, limit? }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const getContinueWatching = async (userId, { page = 1, limit = 10 }) => {
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  const skip = (pageNum - 1) * limitNum;

  // Lọc các phim có progress > 0 và < 100 (chưa xem xong)
  const query = {
    userId,
    progress: { $gt: 0, $lt: 100 },
  };

  const [history, total] = await Promise.all([
    UserHistory.find(query)
      .sort({ lastWatchedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate({
        path: 'movieId',
        select: 'name original_name slug thumb_url poster_url durationMinutes isHidden',
        match: { isHidden: { $ne: true } }, // Filter out hidden movies
      })
      .populate('episodeId', 'name slug filename episodeId audioType'),
    UserHistory.countDocuments(query),
  ]);

  // Filter out entries where movieId is null (hidden movies)
  const filteredHistory = history.filter((item) => item.movieId !== null);

  return {
    data: transformHistoryItems(filteredHistory),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: filteredHistory.length, // Use filtered count
      totalPages: Math.ceil(filteredHistory.length / limitNum),
    },
  };
};

/**
 * Get watch progress for a specific movie
 * @param {string} userId - ID của user
 * @param {string} movieId - ID của movie
 * @returns {Promise<Object|null>} Progress object hoặc null nếu chưa có
 */
const getProgress = async (userId, movieId) => {
  // Sort theo lastWatchedAt desc để đảm bảo lấy progress mới nhất (nếu có nhiều records)
  const history = await UserHistory.findOne({ userId, movieId })
    .sort({ lastWatchedAt: -1 })
    .populate('movieId', 'name original_name slug thumb_url poster_url')
    .populate('episodeId', 'name slug filename episodeId');

  if (!history) {
    return null;
  }

  return transformHistoryItem(history);
};

/**
 * Save/Sync Progress (Lưu tiến độ xem phim)
 * @param {string} userId - ID của user
 * @param {Object} data - Dữ liệu { movieId, episodeId, audioType, watchTime, duration }
 */
const saveProgress = async (userId, { movieId, episodeId, watchTime, duration }) => {
  // Validation
  if (!movieId) {
    throw new Error('Movie ID is required');
  }

  if (watchTime === undefined || watchTime === null) {
    throw new Error('Watch time is required');
  }

  if (duration === undefined || duration === null || duration <= 0) {
    throw new Error('Duration must be greater than 0');
  }

  // Chỉ lưu nếu đã xem ít nhất 5 giây (tránh lưu khi mới load)
  if (watchTime < 5) {
    watchTime = 0;
  }

  // Không lưu nếu đã xem gần hết (>95%) - coi như đã xem xong
  const progressPercent = (watchTime / duration) * 100;
  if (progressPercent > 95) {
    // Có thể xóa history hoặc đánh dấu đã xem xong
    // Ở đây ta vẫn lưu nhưng set progress = 100
    const history = await UserHistory.findOneAndUpdate(
      { userId, movieId },
      {
        episodeId: episodeId || null,
        watchTime: duration,
        duration: duration,
        progress: 100,
        lastWatchedAt: Date.now(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return history;
  }

  // Tính phần trăm tiến độ (0-100%)
  const finalProgress = Math.min(100, Math.max(0, progressPercent));

  // Thực hiện Upsert (Update hoặc Insert)
  const history = await UserHistory.findOneAndUpdate(
    { userId, movieId },
    {
      episodeId: episodeId || null,
      watchTime: Math.floor(watchTime), // Làm tròn xuống
      duration: Math.floor(duration),
      progress: finalProgress,
      lastWatchedAt: Date.now(),
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  return history;
};

/**
 * Delete watch progress/history for a specific movie
 * @param {string} userId - ID của user
 * @param {string} movieId - ID của movie
 * @returns {Promise<Object|null>} Deleted history object hoặc null nếu không tìm thấy
 */
const deleteProgress = async (userId, movieId) => {
  if (!movieId) {
    throw new Error('Movie ID is required');
  }

  const deleted = await UserHistory.findOneAndDelete({ userId, movieId });
  return deleted;
};

const MAX_DISLIKED = 200;

/**
 * Mark a movie "not for me": getForYou and the chat assistant stop suggesting it.
 * Idempotent; keeps the latest MAX_DISLIKED ids.
 */
const dislikeMovie = async (userId, movieId) => {
  if (!/^[a-f0-9]{24}$/i.test(String(movieId || ''))) {
    throw Object.assign(new Error('Invalid movie ID'), { statusCode: 400 });
  }
  if (!(await Movie.exists({ _id: movieId }))) {
    throw Object.assign(new Error('Movie not found'), { statusCode: 404 });
  }
  await User.updateOne(
    { _id: userId, dislikedMovieIds: { $ne: movieId } },
    { $push: { dislikedMovieIds: { $each: [movieId], $slice: -MAX_DISLIKED } } },
  );
  // Lazy require: movie.service is heavy and not needed by the rest of this file
  await require('./movie.service').invalidateForYou(userId);
};

module.exports = {
  dislikeMovie,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  getHistory,
  getContinueWatching,
  getProgress,
  saveProgress,
  deleteProgress,
};
