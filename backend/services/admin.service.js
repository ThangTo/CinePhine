const MovieModel = require('../models/movie.model');
const UserModel = require('../models/user.model');
const TransactionModel = require('../models/transaction.model');
const watchStreakService = require('./watchStreak.service');
const EpisodeModel = require('../models/episode.model');
const UserHistoryModel = require('../models/user_history.model');
const UserFavoriteModel = require('../models/user_favorite.model');
const UserWatchlistModel = require('../models/user_watchlist.model');
const CommentModel = require('../models/comment.model');
const RatingModel = require('../models/rating.model');
const ChatModel = require('../models/chat.model');
const NotificationModel = require('../models/notification.model');
const { transformMovies } = require('../utils/movieTransformer');
const movieService = require('./movie.service');
const notificationService = require('./notification.service');
const analyticsService = require('./analytics.service');
const coinLedgerService = require('./coinLedger.service');
const premiumService = require('./premium.service');
const { invalidateMovieCache, clearCache } = require('../middleware/cache.middleware');
const { parseEpisodeNumber } = require('../utils/movieTransformer');
const { extractEpisodeNumber } = require('../utils/episodeNumber.util');
const { crawlMovieBySlug } = require('./crawler.service');
const { normalizeAvatarForOutput } = require('../utils/avatarUtils');

/**
 * Admin Service
 * Business logic for admin operations
 */

/**
 * Helper: Build MongoDB query for admin movie filtering
 * @param {Object} filters - Filter parameters
 * @returns {Object} MongoDB query object
 */
const buildAdminQuery = (filters = {}) => {
  const {
    search,
    genres,
    countries,
    year,
    yearFrom,
    yearTo,
    quality,
    type,
    ageRating,
    status,
    ratingMin,
    ratingMax,
    isHidden,
  } = filters;

  const query = {};

  // Text search
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { original_name: { $regex: search, $options: 'i' } },
    ];
  }

  // Filter by genres (multiple) - categories is an array of objects with slug
  if (genres && Array.isArray(genres) && genres.length > 0) {
    query['categories.slug'] = { $in: genres };
  }

  // Filter by countries (multiple) - country is an array of objects with slug
  if (countries && Array.isArray(countries) && countries.length > 0) {
    query['country.slug'] = { $in: countries };
  }

  // Filter by year (exact or range)
  if (year) {
    query.year = parseInt(year);
  } else if (yearFrom || yearTo) {
    query.year = {};
    if (yearFrom) query.year.$gte = parseInt(yearFrom);
    if (yearTo) query.year.$lte = parseInt(yearTo);
  }

  // Filter by quality
  if (quality) {
    query.quality = quality;
  }

  // Filter by type
  if (type) {
    query.type = type;
  }

  // Filter by age rating
  if (ageRating) {
    query.age_rating = ageRating;
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by rating range
  if (ratingMin || ratingMax) {
    query.rating = {};
    if (ratingMin) query.rating.$gte = parseFloat(ratingMin);
    if (ratingMax) query.rating.$lte = parseFloat(ratingMax);
  }

  // Filter by hidden status
  if (isHidden !== undefined && isHidden !== null) {
    query.isHidden = isHidden === 'true' || isHidden === true;
  }

  // Filter by featured status (banner)
  if (filters.isFeatured !== undefined && filters.isFeatured !== null) {
    query.isFeatured = filters.isFeatured === 'true' || filters.isFeatured === true;
  }

  return query;
};

/**
 * Helper: Generate unique slug by appending number if exists
 * @param {string} baseSlug - Base slug
 * @param {string} excludeId - Movie ID to exclude from uniqueness check
 * @returns {Promise<string>} Unique slug
 */
const generateUniqueSlug = async (baseSlug, excludeId = null) => {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = { slug };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existing = await MovieModel.findOne(query);
    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

/**
 * Movies Management
 */

/**
 * Get all movies with pagination and filters
 * @param {Object} options - { page, limit, search, genres, countries, year, yearFrom, yearTo, quality, type, ageRating, status, ratingMin, ratingMax, isHidden }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const getAllMovies = async ({
  page,
  limit,
  search,
  genres,
  countries,
  year,
  yearFrom,
  yearTo,
  quality,
  type,
  ageRating,
  status,
  ratingMin,
  ratingMax,
  isHidden,
  isFeatured,
}) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  const skip = (pageNum - 1) * limitNum;

  // Build query filters
  const query = buildAdminQuery({
    search,
    genres,
    countries,
    year,
    yearFrom,
    yearTo,
    quality,
    type,
    ageRating,
    status,
    ratingMin,
    ratingMax,
    isHidden,
    isFeatured,
  });

  // Gọi Database
  const movies = await MovieModel.find(query)
    .sort({ createdAt: -1 }) // Mới nhất lên đầu
    .skip(skip)
    .limit(limitNum)
    .select('-content -actor -director'); // Bỏ bớt field nặng để load nhanh

  const transformedMovies = transformMovies(movies);

  const total = await MovieModel.countDocuments(query);

  return {
    data: transformedMovies,
    pagination: {
      totalItems: total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
  };
};
/**
 * Get movie by ID
 * @param {string|number} id - Movie ID
 * @returns {Promise<Object|null>} Movie object or null
 */
const getMovieById = async (id) => {
  // TODO: Implement - Get movie from database by ID
  return await MovieModel.findById(id);
};

/**
 * Create new movie
 * @param {Object} movieData - Movie data (already transformed from controller)
 * @returns {Promise<Object>} Created movie object
 */
const createMovie = async (movieData) => {
  // Validate required fields
  if (!movieData.name) {
    throw new Error('Movie name is required');
  }

  // Ensure slug exists and is unique
  if (!movieData.slug) {
    throw new Error('Movie slug is required');
  }
  movieData.slug = await generateUniqueSlug(movieData.slug);

  // Validate slug uniqueness (double check)
  const existingMovie = await MovieModel.findOne({ slug: movieData.slug });
  if (existingMovie) {
    movieData.slug = await generateUniqueSlug(movieData.slug);
  }

  // Create movie
  const movie = await MovieModel.create(movieData);

  // Invalidate movie cache after creating new movie
  invalidateMovieCache().catch((err) => {
    console.error('Error invalidating cache:', err);
  });

  return movie;
};

/**
 * Update movie
 * @param {string|number} id - Movie ID
 * @param {Object} movieData - Updated movie data (already transformed from controller)
 * @returns {Promise<Object|null>} Updated movie object or null
 */
const updateMovie = async (id, movieData) => {
  // Check if movie exists
  const existingMovie = await MovieModel.findById(id);
  if (!existingMovie) {
    return null;
  }

  // Handle slug uniqueness if slug is being updated
  if (movieData.slug && movieData.slug !== existingMovie.slug) {
    // Slug is being updated, ensure uniqueness
    movieData.slug = await generateUniqueSlug(movieData.slug, id);
  }

  // Remove undefined values to avoid overwriting with undefined
  Object.keys(movieData).forEach((key) => {
    if (movieData[key] === undefined) {
      delete movieData[key];
    }
  });

  // Update movie (only update provided fields)
  const updatedMovie = await MovieModel.findByIdAndUpdate(
    id,
    { $set: movieData },
    { new: true, runValidators: true },
  );

  // Invalidate movie cache after updating
  if (updatedMovie) {
    invalidateMovieCache().catch((err) => {
      console.error('Error invalidating cache:', err);
    });
  }

  return updatedMovie;
};

/**
 * Delete movie
 * @param {string|number} id - Movie ID
 * @returns {Promise<boolean>} Success status
 */
const deleteMovie = async (id) => {
  // Lấy thông tin phim trước khi xóa để dùng cho thông báo
  const movie = await MovieModel.findById(id);
  if (!movie) {
    return false;
  }

  const movieName = movie.name || movie.title || 'phim này';
  const movieId = movie._id;

  // 1. Tìm tất cả users bị ảnh hưởng (có phim trong favorites, watchlist, hoặc history)
  const [favoriteUsers, watchlistUsers, historyUsers] = await Promise.all([
    UserFavoriteModel.find({ movieId: id }).distinct('userId'),
    UserWatchlistModel.find({ movieId: id }).distinct('userId'),
    UserHistoryModel.find({ movieId: id }).distinct('userId'),
  ]);

  // Gộp tất cả userIds lại và loại bỏ trùng lặp
  const affectedUserIds = [
    ...new Set([
      ...favoriteUsers.map((id) => id.toString()),
      ...watchlistUsers.map((id) => id.toString()),
      ...historyUsers.map((id) => id.toString()),
    ]),
  ];

  // 2. Xóa tất cả references đến phim này
  await Promise.all([
    // Xóa episodes
    EpisodeModel.deleteMany({ movieId: id }),
    // Xóa user history (xem tiếp)
    UserHistoryModel.deleteMany({ movieId: id }),
    // Xóa favorites
    UserFavoriteModel.deleteMany({ movieId: id }),
    // Xóa watchlist
    UserWatchlistModel.deleteMany({ movieId: id }),
    // Xóa comments
    CommentModel.deleteMany({ movieId: id }),
    // Xóa ratings
    RatingModel.deleteMany({ movieId: id }),
    // Xóa notifications liên quan đến phim này
    NotificationModel.deleteMany({ movieId: id }),
    // Set null movieId trong chat metadata (giữ lại chat history nhưng không link đến phim đã xóa)
    ChatModel.updateMany({ 'metadata.movieId': id }, { $set: { 'metadata.movieId': null } }),
  ]);

  // 3. Tạo thông báo cho tất cả users bị ảnh hưởng
  if (affectedUserIds.length > 0) {
    try {
      const notifications = affectedUserIds.map((userId) => ({
        userId: userId,
        type: 'system',
        title: 'Phim đã bị xóa',
        message: `Phim "${movieName}" đã bị xóa khỏi hệ thống. Phim đã được gỡ khỏi danh sách yêu thích, xem tiếp và các danh sách khác của bạn.`,
        movieId: null, // Không link đến phim vì đã bị xóa
        targetUrl: null,
        isRead: false,
      }));

      // Tạo thông báo cho từng user
      await Promise.all(
        notifications.map((notiData) => notificationService.createNotification(notiData)),
      );
    } catch (error) {
      // Log lỗi nhưng không fail việc xóa phim
      console.error('Error creating notifications for deleted movie:', error);
    }
  }

  // 4. Cuối cùng mới xóa phim
  await MovieModel.findByIdAndDelete(id);

  // 5. Invalidate movie cache after deletion
  invalidateMovieCache().catch((err) => {
    console.error('Error invalidating cache:', err);
  });

  return true;
};

/**
 * Toggle movie hidden status (hide/unhide)
 * @param {string|number} id - Movie ID
 * @returns {Promise<Object>} Updated movie with new isHidden status
 */
const toggleMovieHidden = async (id) => {
  const movie = await MovieModel.findById(id);
  if (!movie) {
    throw new Error('Phim không tồn tại');
  }

  // Toggle isHidden status
  movie.isHidden = !movie.isHidden;
  await movie.save();

  // Invalidate movie cache after status change
  invalidateMovieCache().catch((err) => {
    console.error('Error invalidating cache:', err);
  });

  return {
    success: true,
    isHidden: movie.isHidden,
    message: movie.isHidden ? 'Đã ẩn phim' : 'Đã hiện phim',
  };
};

/**
 * Toggle movie featured status (pin/unpin to banner)
 * @param {string|number} id - Movie ID
 * @returns {Promise<Object>} Updated movie with new isFeatured status
 */
const toggleMovieFeatured = async (id) => {
  const movie = await MovieModel.findById(id);
  if (!movie) {
    throw new Error('Phim không tồn tại');
  }

  // Toggle isFeatured status
  movie.isFeatured = !movie.isFeatured;
  await movie.save();

  // Invalidate movie cache after status change
  invalidateMovieCache().catch((err) => {
    console.error('Error invalidating cache:', err);
  });

  return {
    success: true,
    isFeatured: movie.isFeatured,
    message: movie.isFeatured ? 'Đã đưa phim lên banner' : 'Đã gỡ phim khỏi banner',
  };
};

/**
 * Hide all movies
 * @returns {Promise<Object>} Result with count of hidden movies
 */
const hideAllMovies = async () => {
  try {
    const result = await MovieModel.updateMany(
      { isHidden: { $ne: true } }, // Only update movies that are not already hidden
      { $set: { isHidden: true } },
    );

    // Invalidate movie cache after bulk update
    invalidateMovieCache().catch((err) => {
      console.error('Error invalidating cache:', err);
    });

    return {
      success: true,
      count: result.modifiedCount,
      message: `Đã ẩn ${result.modifiedCount} phim`,
    };
  } catch (error) {
    throw new Error('Không thể ẩn tất cả phim: ' + error.message);
  }
};

/**
 * Unhide all movies
 * @returns {Promise<Object>} Result with count of unhidden movies
 */
const unhideAllMovies = async () => {
  try {
    const result = await MovieModel.updateMany(
      { isHidden: true }, // Only update movies that are hidden
      { $set: { isHidden: false } },
    );

    // Invalidate movie cache after bulk update
    invalidateMovieCache().catch((err) => {
      console.error('Error invalidating cache:', err);
    });

    return {
      success: true,
      count: result.modifiedCount,
      message: `Đã hiện ${result.modifiedCount} phim`,
    };
  } catch (error) {
    throw new Error('Không thể hiện tất cả phim: ' + error.message);
  }
};

/**
 * Search movies
 * @param {string} query - Search query
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const searchMovies = async (query, options = {}) => {
  // Tái sử dụng logic của getAllMovies cho gọn code
  return await getAllMovies({ ...options, search: query });
};

/**
 * Users Management
 */

/**
 * Get all users with pagination and filters
 * @param {Object} options - { page, limit, search }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const getAllUsers = async (options = {}) => {
  const { page = 1, limit = 20, search } = options;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const skip = (pageNum - 1) * limitNum;

  let query = {};
  if (search) {
    query = {
      $or: [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    };
  }

  const [users, total] = await Promise.all([
    UserModel.find(query)
      .select('-password') // QUAN TRỌNG: Không bao giờ trả về password
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    UserModel.countDocuments(query),
  ]);

  // Attach streak info to each user (already in User document)
  const usersWithStreak = users.map(u => {
    const obj = u.toObject ? u.toObject() : u;
    const premiumUser = premiumService.normalizePremiumSnapshot(obj);
    return {
      ...premiumUser,
      watchStreak: watchStreakService.getCurrentStreakValue(obj),
      longestStreak: obj.longestStreak || 0,
      lastWatchDate: obj.lastWatchDate || null,
    };
  });

  return {
    data: usersWithStreak,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * Get user by ID
 * @param {string|number} id - User ID
 * @returns {Promise<Object|null>} User object or null
 */
const getUserById = async (id) => {
  const user = await UserModel.findById(id).select('-password');
  return user ? premiumService.normalizePremiumSnapshot(user) : null;
};

/**
 * Create new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user object
 */
const createUser = async (userData) => {
  return await UserModel.create(premiumService.buildAdminPremiumUpdate(userData));
};

/**
 * Update user
 * @param {string|number} id - User ID
 * @param {Object} userData - Updated user data
 * @returns {Promise<Object|null>} Updated user object or null
 */
const updateUser = async (id, userData) => {
  const { coin: _coin, ...editableUserData } = userData;
  const currentUser = await UserModel.findById(id).select('role');
  if (!currentUser) return null;

  const updateData = premiumService.buildAdminPremiumUpdate(editableUserData, new Date(), {
    defaultMissingPremiumFields: currentUser.role !== 'premium',
  });
  const user = await UserModel.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).select('-password');
  return user ? premiumService.normalizePremiumSnapshot(user) : null;
};

const adjustUserCoins = async (id, { amount, note = '' } = {}) => {
  const delta = Number(amount);
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('Coin adjustment must be a non-zero integer');
  }

  const coinChange = await coinLedgerService.applyCoinChange({
    userId: id,
    delta,
    reason: 'admin_adjustment',
    sourceType: 'admin_user',
    sourceId: `admin-adjust:${id}:${Date.now()}`,
    note: note || `Admin dieu chinh coin: ${delta}`,
    metadata: { amount: delta },
  });

  const user = await UserModel.findById(id).select('-password');
  return {
    message: `Adjusted ${delta} coin`,
    user: user ? premiumService.normalizePremiumSnapshot(user) : null,
    entry: coinChange.entry,
    totalCoins: coinChange.balanceAfter,
  };
};

/**
 * Delete user
 * @param {string|number} id - User ID
 * @returns {Promise<boolean>} Success status
 */
const deleteUser = async (id) => {
  // TODO: Implement - Delete user from database
  const result = await UserModel.findByIdAndDelete(id);
  return !!result; // Trả về true/false
};

/**
 * Toggle user status (active/inactive)
 * @param {string|number} id - User ID
 * @returns {Promise<Object|null>} Updated user object or null
 */
const toggleUserStatus = async (id) => {
  // TODO: Implement - Toggle user status in database
  const user = await UserModel.findById(id);
  if (!user) return null;

  // Đảo trạng thái isBanned (Khóa/Mở khóa)
  // Đảm bảo trong User Schema có trường này (hoặc trường isActive)
  user.isBanned = !user.isBanned;
  return await user.save();
};

/**
 * Statistics
 */

/**
 * Calculate percentage change between current and previous values.
 * Returns a signed percentage (e.g., 25 or -10). If previous is 0,
 * treat any current value as 100% growth, otherwise 0.
 */
const calculateTrend = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const change = ((current - previous) / previous) * 100;
  return Number(change.toFixed(2));
};

/**
 * Get dashboard statistics with week-over-week absolute values.
 * Counts for "currentWeek" are for the last 7 days.
 * Counts for "lastWeek" are for the 7 days before that.
 */
const getStats = async () => {
  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - 7);

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  const ViewHistoryModel = require('../models/view_history.model');

  const [
    totalMovies,
    totalUsers,
    totalViewsData,
    moviesThisWeek,
    moviesPrevWeek,
    usersThisWeek,
    usersPrevWeek,
    viewsThisWeek,
    viewsPrevWeek,
    realtimeOnline,
    visitsComparison
  ] = await Promise.all([
    MovieModel.countDocuments(),
    UserModel.countDocuments(),
    MovieModel.aggregate([{ $group: { _id: null, total: { $sum: '$viewCount' } } }]),
    MovieModel.countDocuments({ createdAt: { $gte: currentWeekStart } }),
    MovieModel.countDocuments({ createdAt: { $gte: previousWeekStart, $lt: currentWeekStart } }),
    UserModel.countDocuments({ createdAt: { $gte: currentWeekStart } }),
    UserModel.countDocuments({ createdAt: { $gte: previousWeekStart, $lt: currentWeekStart } }),
    // Sử dụng ViewHistoryModel thay vì UserHistoryModel để đếm lượt xem thực tế
    ViewHistoryModel.countDocuments({ createdAt: { $gte: currentWeekStart } }),
    ViewHistoryModel.countDocuments({
      createdAt: { $gte: previousWeekStart, $lt: currentWeekStart },
    }),
    analyticsService.getRealtimeActiveUsers(),
    analyticsService.getWeeklyVisitsComparison()
  ]);

  const totalViews = totalViewsData.length > 0 ? totalViewsData[0].total : 0;

  return {
    totalMovies,
    totalUsers,
    totalViews,
    onlineNow: realtimeOnline.total || 0,
    newUsers: usersThisWeek, // Keep for backward compatibility if needed, but we'll focus on weekly
    weekly: {
      movies: { current: moviesThisWeek, last: moviesPrevWeek },
      users: { current: usersThisWeek, last: usersPrevWeek },
      views: { current: viewsThisWeek, last: viewsPrevWeek },
      online: { current: visitsComparison.thisWeek.total, last: visitsComparison.lastWeek.total }
    },
    // Keep trends but rename or use them to store absolute values for frontend easier migration
    trends: {
      movies: moviesThisWeek,
      users: usersThisWeek,
      views: viewsThisWeek,
      newUsers: usersPrevWeek // This is a bit ambiguous now, better use weekly object
    }
  };
};

/**
 * Get chart data
 * @param {string} type - Chart type (views, genres, growth)
 * @returns {Promise<Object>} Chart data object
 */
const getChartData = async (type) => {
  // Top 10 films with highest viewCount
  if (type === 'views' || type === 'top-movies' || !type) {
    const topMovies = await MovieModel.find()
      .sort({ viewCount: -1 })
      .limit(10)
      .select('name viewCount poster_url');

    return {
      labels: topMovies.map((m) => m.name),
      data: topMovies.map((m) => m.viewCount),
      posters: topMovies.map((m) => m.poster_url || ''),
    };
  }

  // Top 10 categories by total viewCount
  if (type === 'genres') {
    // Sử dụng logic từ movie service
    const topGenres = await movieService.getTopGenresByViews(10);
    return {
      labels: topGenres.map((g) => g.name),
      data: topGenres.map((g) => g.totalViews),
      slugs: topGenres.map((g) => g.slug),
      genres: topGenres,
    };
  }

  // Watch Time Trend (Last 7 Days)
  if (type === 'watch-time-trend') {
    const ViewHistoryModel = require('../models/view_history.model');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const aggregation = await ViewHistoryModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+07:00' } },
          totalDuration: { $sum: '$watchDuration' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const labels = [];
    const data = [];
    const dataMap = new Map();

    // Convert seconds to minutes for the chart
    aggregation.forEach((item) => {
      dataMap.set(item._id, Math.round(item.totalDuration / 60));
    });

    // Fill the array for the last 7 days sequentially
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      // Construct date string formatted identically to MongoDB %Y-%m-%d
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      const dayName = d.toLocaleDateString('vi-VN', { weekday: 'short' }); 
      
      labels.push(`${dayName} (${d.getDate()}/${d.getMonth() + 1})`);
      data.push(dataMap.get(dateStr) || 0);
    }

    return {
      labels,
      data,
    };
  }

  // Peak Hours Heatmap
  if (type === 'peak-hours') {
    const ViewHistoryModel = require('../models/view_history.model');
    const aggregation = await ViewHistoryModel.aggregate([
      {
        $group: {
          _id: { $hour: { date: '$createdAt', timezone: '+07:00' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const dataMap = new Map(aggregation.map(item => [item._id, item.count]));
    const data = Array.from({ length: 24 }, (_, i) => dataMap.get(i) || 0);
    return { labels, data };
  }

  // Devices Doughnut
  if (type === 'devices') {
    const ViewHistoryModel = require('../models/view_history.model');
    const aggregation = await ViewHistoryModel.aggregate([
      {
        $group: {
          _id: '$deviceType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);
    return {
      labels: aggregation.map((a) => a._id),
      data: aggregation.map((a) => a.count),
    };
  }

  // Global Retention Rate Array (for Gauge)
  if (type === 'retention-overview') {
    const ViewHistoryModel = require('../models/view_history.model');
    const views = await ViewHistoryModel.find()
      .populate('movieId', 'time')
      .lean();
    
    let totalRetention = 0;
    let validCount = 0;
    
    for (const v of views) {
      if (v.movieId && v.movieId.time) {
        const timeMatch = v.movieId.time.match(/\d+/);
        if (timeMatch) {
          const totalMins = parseInt(timeMatch[0], 10);
          if (totalMins > 0) {
            const retention = (v.watchDuration / 60) / totalMins;
            totalRetention += Math.min(retention, 1);
            validCount++;
          }
        }
      }
    }
    const avgRetention = validCount > 0 ? (totalRetention / validCount) * 100 : 0;
    return {
      retentionRate: Math.round(avgRetention),
    };
  }

  // Placeholder cho các loại chart khác
  return {
    labels: [],
    data: [],
  };
};

/**
 * Settings Service
 */
const SettingsModel = require('../models/Settings');

/**
 * Get setting by key
 * @param {string} key - Setting key
 * @returns {Promise<Object|null>} Setting object or null
 */
const getSetting = async (key) => {
  const setting = await SettingsModel.findOne({ key });
  return setting ? setting.value : null;
};

/**
 * Set setting by key
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @param {string} description - Optional description
 * @returns {Promise<Object>} Updated or created setting
 */
const setSetting = async (key, value, description = '') => {
  const setting = await SettingsModel.findOneAndUpdate(
    { key },
    { key, value, description },
    { upsert: true, new: true },
  );
  return setting;
};

/**
 * Get theme setting
 * @returns {Promise<string>} Theme name (default: 'default')
 */
const getTheme = async () => {
  const theme = await getSetting('theme');
  return theme || 'default';
};

/**
 * Set theme setting
 * @param {string} themeName - Theme name
 * @returns {Promise<Object>} Updated setting
 */
const setTheme = async (themeName) => {
  const setting = await setSetting('theme', themeName, 'Global theme for the website');
  await clearCache('cache:/api/v1/movies/meta/theme*');
  return setting;
};

// ─── Pricing Service ──────────────────────────────────────────────────────────

const DEFAULT_COIN_PACKAGES = [
  { id: 'pkg_1', amount: 10,  bonus: 0,   label: '10 coin',    price: 10000,  sortOrder: 1 },
  { id: 'pkg_2', amount: 50,  bonus: 5,   label: '55 coin',    price: 50000,  sortOrder: 2 },
  { id: 'pkg_3', amount: 100, bonus: 15,  label: '115 coin',   price: 100000, sortOrder: 3 },
  { id: 'pkg_4', amount: 200, bonus: 40,  label: '240 coin',   price: 200000, sortOrder: 4 },
  { id: 'pkg_5', amount: 500, bonus: 150,  label: '650 coin',   price: 500000, sortOrder: 5 },
];

const DEFAULT_PREMIUM_PLANS = [
  { id: 'plan_weekly',  planKey: 'weekly',  label: 'Tuần',     days: 7,   coins: 30,   sortOrder: 1 },
  { id: 'plan_monthly', planKey: 'monthly', label: 'Tháng',   days: 30,  coins: 100,  sortOrder: 2 },
  { id: 'plan_yearly',  planKey: 'yearly',  label: 'Năm',     days: 365, coins: 1000, sortOrder: 3 },
];

/**
 * Ensure default pricing is seeded in the database.
 * Safe to call on startup — only upserts if missing.
 */
const seedPricingSettings = async () => {
  const existingCoin = await SettingsModel.findOne({ key: 'coin_packages' });
  if (!existingCoin) {
    await SettingsModel.create({ key: 'coin_packages', value: DEFAULT_COIN_PACKAGES, description: 'Danh sách gói coin' });
  }
  const existingPremium = await SettingsModel.findOne({ key: 'premium_plans' });
  if (!existingPremium) {
    await SettingsModel.create({ key: 'premium_plans', value: DEFAULT_PREMIUM_PLANS, description: 'Danh sách gói premium' });
  }
};

/**
 * Get coin packages from DB (with defaults as fallback).
 */
const getCoinPackages = async () => {
  const value = await getSetting('coin_packages');
  return value && Array.isArray(value) ? value : DEFAULT_COIN_PACKAGES;
};

/**
 * Upsert a single coin package by id. Adds if missing.
 */
const upsertCoinPackage = async (pkg) => {
  const packages = await getCoinPackages();
  const idx = packages.findIndex((p) => p.id === pkg.id);
  if (idx >= 0) {
    packages[idx] = { ...packages[idx], ...pkg };
  } else {
    packages.push({ ...pkg, id: pkg.id || `pkg_${Date.now()}` });
  }
  await setSetting('coin_packages', packages, 'Danh sách gói coin');
  return packages;
};

/**
 * Remove a coin package by id.
 */
const deleteCoinPackage = async (id) => {
  const packages = await getCoinPackages().then((p) => p.filter((x) => x.id !== id));
  await setSetting('coin_packages', packages, 'Danh sách gói coin');
  return packages;
};

/**
 * Reorder coin packages.
 * @param {string[]} orderedIds - IDs in desired display order
 */
const reorderCoinPackages = async (orderedIds) => {
  const packages = await getCoinPackages();
  const reordered = orderedIds
    .map((id, idx) => {
      const pkg = packages.find((p) => p.id === id);
      return pkg ? { ...pkg, sortOrder: idx + 1 } : null;
    })
    .filter(Boolean);
  await setSetting('coin_packages', reordered, 'Danh sách gói coin');
  return reordered;
};

/**
 * Get premium plans from DB (with defaults as fallback).
 */
const getPremiumPlans = async () => {
  const value = await getSetting('premium_plans');
  return value && Array.isArray(value) ? value : DEFAULT_PREMIUM_PLANS;
};

/**
 * Upsert a premium plan by id.
 */
const upsertPremiumPlan = async (plan) => {
  if (!premiumService.VALID_PREMIUM_PLAN_KEYS.includes(plan.planKey)) {
    throw new Error('Premium plan only supports weekly, monthly or yearly');
  }

  const plans = await getPremiumPlans();
  const idx = plans.findIndex((p) => p.id === plan.id);
  if (idx >= 0) {
    plans[idx] = { ...plans[idx], ...plan };
  } else {
    plans.push({ ...plan, id: plan.id || `plan_${Date.now()}` });
  }
  await setSetting('premium_plans', plans, 'Danh sách gói premium');
  return plans;
};

/**
 * Remove a premium plan by id.
 */
const deletePremiumPlan = async (id) => {
  const plans = await getPremiumPlans().then((p) => p.filter((x) => x.id !== id));
  await setSetting('premium_plans', plans, 'Danh sách gói premium');
  return plans;
};

/**
 * Get active premium plan price for a given planKey (used by upgradePremium controller).
 */
const getPremiumPlanPrice = async (planKey) => {
  const plans = await getPremiumPlans();
  const plan = plans.find((p) => p.planKey === planKey);
  return plan ? { coins: plan.coins, days: plan.days } : null;
};

/**
 * Episodes Update Service
 */
const axios = require('axios');

const API_BASE_URL = 'https://phimapi.com';

// Helpers

const detectAudioType = (serverName = '') => {
  const lower = serverName.toLowerCase();
  if (lower.includes('vietsub')) return 'vietsub';
  if (lower.includes('thuyết minh') || lower.includes('thuyet minh')) return 'thuyet-minh';
  if (lower.includes('lồng tiếng') || lower.includes('long tieng')) return 'long-tieng';
  return 'khac';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Update episodes for a single movie
 * @param {Object} movie - Movie object with _id and slug
 * @returns {Promise<Object>} Update result
 */
const updateEpisodesForMovie = async (movie, onlyNewEpisodes = false) => {
  const slug = movie.slug;
  if (!slug) return { updated: 0, skipped: true, error: 'No slug' };

  try {
    // Lấy chi tiết phim từ API nguồn
    const detailResponse = await axios.get(`${API_BASE_URL}/phim/${slug}`);
    const movieData = detailResponse.data?.movie;
    const episodesData = detailResponse.data?.episodes;

    if (!movieData || !episodesData || !episodesData.length) {
      return { updated: 0, skipped: true, error: 'No episodes data' };
    }

    // Lưu lại số tập trước khi cập nhật
    let prevCurrent = parseEpisodeNumber(movie.currentEpisode) || null;
    const prevTotal = parseInt(movie.totalEpisodes) || 0;

    // Xác định status dựa trên logic giống detail page
    // Nếu currentEpisode === totalEpisodes thì status = "completed"
    // Nếu currentEpisode > 0 && currentEpisode < totalEpisodes thì status = "ongoing"
    // Nếu không có tập nào thì giữ nguyên status hoặc dùng từ API
    let newStatus = movieData.status || movie.status;
    let currentEp = parseEpisodeNumber(movieData.episode_current) || 0;
    const totalEp = parseInt(movieData.episode_total) || 0;

    if (currentEp > 0 && totalEp > 0 && currentEp === totalEp) {
      // Đã hoàn thành tất cả tập
      newStatus = 'completed';
    } else if (currentEp > 0 && totalEp > 0 && currentEp < totalEp) {
      // Đang cập nhật (có tập nhưng chưa đủ)
      newStatus = 'ongoing';
    } else if (currentEp === 0 && totalEp === 0) {
      // Chưa có tập nào, có thể là upcoming
      if (movieData.status === 'upcoming' || movie.status === 'upcoming') {
        newStatus = 'upcoming';
      } else {
        // Giữ nguyên status hiện tại nếu không phải upcoming
        newStatus = movie.status || 'ongoing';
      }
    }

    // Cập nhật thống kê tập cho Movie
    await MovieModel.updateOne(
      { _id: movie._id },
      {
        currentEpisode: currentEp,
        totalEpisodes: totalEp,
        status: newStatus,
      },
    );

    let updatedCount = 0;
    let skippedCount = 0;

    // Nếu chỉ cập nhật tập mới, lấy danh sách (episodeId, audioType) hiện có trong DB
    let existingEpisodeAudioPairs = new Set();
    if (onlyNewEpisodes) {
      const existingEpisodes = await EpisodeModel.find({ movieId: movie._id })
        .select('episodeId audioType')
        .lean();

      // Tạo Set chứa các cặp "episodeId-audioType" đã tồn tại
      existingEpisodes.forEach((ep) => {
        existingEpisodeAudioPairs.add(`${ep.episodeId}-${ep.audioType || 'unknown'}`);
      });
    }

    // Duyệt các server
    for (const server of episodesData) {
      const serverData = server.server_data || [];
      const audioType = detectAudioType(server.server_name);

      for (const ep of serverData) {
        const episodeNumber = extractEpisodeNumber(ep.name);

        // Nếu chỉ cập nhật tập mới, kiểm tra cặp (episodeId, audioType) đã tồn tại chưa
        if (onlyNewEpisodes) {
          const pairKey = `${episodeNumber}-${audioType || 'unknown'}`;
          if (existingEpisodeAudioPairs.has(pairKey)) {
            skippedCount++;
            continue;
          }
        }

        const episodePayload = {
          movieId: movie._id,
          episodeId: episodeNumber,
          slug: ep.slug,
          filename: ep.filename,
          serverName: server.server_name,
          audioType,
          link_embed: ep.link_embed,
          link_m3u8: ep.link_m3u8,
          duration: 0,
        };

        await EpisodeModel.findOneAndUpdate(
          {
            movieId: movie._id,
            episodeId: episodePayload.episodeId,
            audioType,
          },
          episodePayload,
          { upsert: true, new: true },
        );
        updatedCount++;
      }
    }

    return {
      updated: updatedCount,
      skipped: false,
      skippedEpisodes: skippedCount,
      prevCurrent,
      prevTotal,
      newCurrent: currentEp,
      newTotal: totalEp,
      movieSlug: slug,
      movieName: movie.name || movie.title,
      onlyNewEpisodes,
    };
  } catch (error) {
    return {
      updated: 0,
      skipped: false,
      error: error.message,
      movieSlug: slug,
      movieName: movie.name || movie.title,
    };
  }
};

/**
 * Update episodes for multiple movies
 * @param {Array<string>} movieIds - Array of movie IDs
 * @param {Function} onProgress - Optional callback for progress updates
 * @param {Boolean} onlyNewEpisodes - If true, only update new episodes (skip existing ones)
 * @returns {Promise<Object>} Update results
 */
const updateEpisodesForMovies = async (movieIds, onProgress = null, onlyNewEpisodes = false) => {
  if (!Array.isArray(movieIds) || movieIds.length === 0) {
    throw new Error('Movie IDs array is required');
  }

  // Lấy thông tin phim từ database
  const movies = await MovieModel.find({
    _id: { $in: movieIds },
    status: { $in: ['ongoing', 'upcoming'] },
  })
    .select('_id slug name title status currentEpisode totalEpisodes')
    .lean();

  if (movies.length === 0) {
    const result = {
      total: 0,
      updated: 0,
      results: [],
      message: 'No movies found with ongoing/upcoming status',
    };
    if (onProgress) {
      onProgress({ type: 'complete', ...result });
    }
    return result;
  }

  const results = [];
  let totalUpdated = 0;
  let totalSkippedEpisodes = 0;

  // Send initial progress
  if (onProgress) {
    onProgress({
      type: 'progress',
      message: `Bắt đầu cập nhật ${movies.length} phim${
        onlyNewEpisodes ? ' (chỉ tập mới)' : ''
      }...`,
      current: 0,
      total: movies.length,
      onlyNewEpisodes,
    });
  }

  for (let idx = 0; idx < movies.length; idx++) {
    const movie = movies[idx];
    const result = await updateEpisodesForMovie(movie, onlyNewEpisodes);
    totalUpdated += result.updated;
    totalSkippedEpisodes += result.skippedEpisodes || 0;

    const resultData = {
      movieId: movie._id.toString(),
      movieName: movie.name || movie.title,
      movieSlug: movie.slug,
      ...result,
    };
    results.push(resultData);

    // Send progress update
    if (onProgress) {
      const message = onlyNewEpisodes
        ? `[${idx + 1}/${movies.length}] ${movie.name || movie.title}: ${result.updated} tập mới, ${
            result.skippedEpisodes || 0
          } tập bỏ qua`
        : `[${idx + 1}/${movies.length}] ${movie.name || movie.title}: ${
            result.updated
          } tập đã cập nhật`;

      onProgress({
        type: 'progress',
        message,
        current: idx + 1,
        total: movies.length,
        result: resultData,
      });
    }

    // Tránh spam API
    if (idx < movies.length - 1) {
      await sleep(300);
    }
  }

  const finalResult = {
    total: movies.length,
    updated: totalUpdated,
    skippedEpisodes: totalSkippedEpisodes,
    onlyNewEpisodes,
    results,
  };

  return finalResult;
};

/**
 * Update quality for movies by re-crawling them
 * @param {Array<string>} movieIds - Array of movie IDs to update
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Update results
 */
const updateQualityForMovies = async (movieIds, onProgress = null) => {
  if (!Array.isArray(movieIds) || movieIds.length === 0) {
    throw new Error('Movie IDs array is required');
  }

  // Lấy thông tin phim từ database
  const movies = await MovieModel.find({
    _id: { $in: movieIds },
  })
    .select('_id slug name title quality')
    .lean();

  if (movies.length === 0) {
    const result = {
      total: 0,
      updated: 0,
      results: [],
      message: 'No movies found',
    };
    if (onProgress) {
      onProgress({ type: 'complete', ...result });
    }
    return result;
  }

  const results = [];
  let totalUpdated = 0;

  // Send initial progress
  if (onProgress) {
    onProgress({
      type: 'progress',
      message: `Bắt đầu cập nhật ${movies.length} phim...`,
      current: 0,
      total: movies.length,
    });
  }

  for (let idx = 0; idx < movies.length; idx++) {
    const movie = movies[idx];
    const prevQuality = movie.quality || 'Unknown';

    try {
      // Crawl lại phim - hàm này sẽ tự động cập nhật tất cả thông tin bao gồm quality
      const result = await crawlMovieBySlug(movie.slug);

      if (!result.success) {
        results.push({
          movieId: movie._id.toString(),
          movieName: movie.name || movie.title,
          movieSlug: movie.slug,
          error: result.message || 'Không thể crawl phim',
          prevQuality,
          newQuality: prevQuality,
        });

        if (onProgress) {
          onProgress({
            type: 'progress',
            message: `[${idx + 1}/${movies.length}] ${movie.name || movie.title}: Lỗi`,
            current: idx + 1,
            total: movies.length,
            result: results[results.length - 1],
          });
        }
        continue;
      }

      // Lấy quality mới từ movie đã được cập nhật
      const updatedMovie = await MovieModel.findById(movie._id).select('quality').lean();
      const newQuality = updatedMovie?.quality || prevQuality;

      totalUpdated++;

      results.push({
        movieId: movie._id.toString(),
        movieName: movie.name || movie.title,
        movieSlug: movie.slug,
        prevQuality,
        newQuality,
        success: true,
      });

      if (onProgress) {
        const qualityChanged = prevQuality !== newQuality;
        const message = qualityChanged
          ? `[${idx + 1}/${movies.length}] ${
              movie.name || movie.title
            }: ${prevQuality} → ${newQuality}`
          : `[${idx + 1}/${movies.length}] ${
              movie.name || movie.title
            }: Đã cập nhật (${newQuality})`;

        onProgress({
          type: 'progress',
          message,
          current: idx + 1,
          total: movies.length,
          result: results[results.length - 1],
        });
      }
    } catch (error) {
      results.push({
        movieId: movie._id.toString(),
        movieName: movie.name || movie.title,
        movieSlug: movie.slug,
        error: error.message,
        prevQuality,
        newQuality: prevQuality,
      });

      if (onProgress) {
        onProgress({
          type: 'progress',
          message: `[${idx + 1}/${movies.length}] ${movie.name || movie.title}: Lỗi - ${
            error.message
          }`,
          current: idx + 1,
          total: movies.length,
          result: results[results.length - 1],
        });
      }
    }

    // Tránh spam API
    if (idx < movies.length - 1) {
      await sleep(500);
    }
  }

  const finalResult = {
    total: movies.length,
    updated: totalUpdated,
    results,
  };

  return finalResult;
};

/**
 * Get movies for update modal
 * - If quality param provided: show ALL movies with that quality (for quality tab)
 * - If tab=thumbnails: show ALL movies (for thumbnails tab)
 * - If no quality param: show only ongoing/upcoming movies (for episodes tab)
 * @param {Object} options - { page?, limit?, search?, quality?, tab? }
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
const getUpdatingMovies = async (options = {}) => {
  const { page = 1, limit = 50, search, quality, tab } = options;
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 50;
  const skip = (pageNum - 1) * limitNum;

  const query = {};

  // Filter based on tab
  if (tab === 'thumbnails') {
    // Thumbnails tab: show ALL movies (no status filter)
    // No additional filters
  } else if (quality) {
    // Quality tab: filter by quality
    query.quality = quality;
  } else {
    // Episodes tab: ongoing/upcoming movies
    query.status = { $in: ['ongoing', 'upcoming'] };
  }

  // Search filter
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { original_name: { $regex: search, $options: 'i' } },
    ];
  }

  const [movies, total] = await Promise.all([
    MovieModel.find(query)
      .sort({ createdAt: -1 })
      // Only sort if not thumbnails tab (to avoid memory issues with large datasets)
      .skip(skip)
      .limit(limitNum)
      .select('_id slug name title status currentEpisode totalEpisodes poster_url quality')
      .lean(),
    MovieModel.countDocuments(query),
  ]);

  // Get thumbnail status for each movie
  const movieIds = movies.map((m) => m._id);
  const episodesWithThumbnails = await EpisodeModel.find({
    movieId: { $in: movieIds },
    thumbnail_sprite: { $exists: true, $ne: null },
    thumbnail_vtt: { $exists: true, $ne: null },
  })
    .select('movieId')
    .lean();

  // Create a Set of movie IDs that have thumbnails
  const moviesWithThumbnails = new Set(episodesWithThumbnails.map((ep) => ep.movieId.toString()));

  const transformedMovies = movies.map((movie) => ({
    id: movie._id.toString(),
    title: movie.name || movie.title,
    slug: movie.slug,
    status: movie.status,
    currentEpisode: parseEpisodeNumber(movie.currentEpisode),
    totalEpisodes: movie.totalEpisodes,
    poster: movie.poster_url,
    quality: movie.quality || 'HD',
    hasThumbnails: moviesWithThumbnails.has(movie._id.toString()),
  }));

  return {
    data: transformedMovies,
    pagination: {
      totalItems: total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
  };
};

/**
 * Get top trending movies by timeframe
 * @param {string} timeframe - 'today', 'week', 'month'
 * @returns {Promise<Array>} List of trending movies with per-episode breakdown
 */
const getTrendingMovies = async (timeframe = 'today', page = 1, limit = 10) => {
  const ViewHistoryModel = require('../models/view_history.model');
  const MovieModel = require('../models/movie.model');
  const EpisodeModel = require('../models/episode.model');
  const UserModel = require('../models/user.model');

  const now = new Date();
  const startDate = new Date(now.getTime()); // clone — mutations below must NOT affect `now`
  if (timeframe === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (timeframe === 'week') {
    startDate.setDate(now.getDate() - 7);
  } else if (timeframe === 'month') {
    startDate.setMonth(now.getMonth() - 1);
  } else {
    startDate.setHours(0, 0, 0, 0);
  }
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  // 1. Movie-level trending aggregation with $facet for total count + paginated results
  const aggregationRaw = await ViewHistoryModel.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: '$movieId',
        views: { $sum: 1 },
        totalWatchTime: { $sum: '$watchDuration' },
        uniqueUsers: { $addToSet: { $ifNull: ['$userId', '$ipAddress'] } },
        recentViews: { $sum: { $cond: [{ $gte: ['$createdAt', threeHoursAgo] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 1,
        views: 1,
        totalWatchTime: { $round: [{ $divide: ['$totalWatchTime', 60] }, 0] },
        uniqueViewers: { $size: '$uniqueUsers' },
        recentViews: 1,
        velocity: { $round: [{ $divide: ['$recentViews', 3] }, 2] },
      }
    },
    { $sort: { totalWatchTime: -1, views: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limitNum }],
      }
    },
  ]);

  const facetData = aggregationRaw[0] || {};
  const total = facetData.metadata?.[0]?.total || 0;
  const aggregation = facetData.data || [];

  const movieIds = aggregation.map(item => item._id);
  const movies = await MovieModel.find({ _id: { $in: movieIds } })
    .select('name slug poster_url thumb_url type totalEpisodes totalEpisodeViews totalEpisodeWatchTime')
    .lean();
  const movieMap = new Map(movies.map(m => [m._id.toString(), m]));

  const seriesMovies = movies
    .filter(m => m.type === 'series' || m.type === 'tvshows' || m.type === 'hoathinh' || (m.totalEpisodes || 0) > 1)
    .map(m => m._id);

  // 2. Fetch episodes from DB (with audio type info)
  const seriesEpisodeMap = new Map();
  if (seriesMovies.length > 0) {
    const eps = await EpisodeModel.find({ movieId: { $in: seriesMovies } })
      .select('movieId episodeId slug serverName audioType')
      .sort({ movieId: 1, episodeId: 1, audioType: 1 })
      .lean();
    eps.forEach(ep => {
      const mId = ep.movieId.toString();
      if (!seriesEpisodeMap.has(mId)) seriesEpisodeMap.set(mId, []);
      seriesEpisodeMap.get(mId).push(ep);
    });
  }

  // 3. Episode-level stats within timeframe — join ViewHistory with Episode to get episodeId number + audioType
  const episodeStatsWithAudio = await ViewHistoryModel.aggregate([
    { $match: { createdAt: { $gte: startDate }, movieId: { $in: seriesMovies }, episodeId: { $ne: null } } },
    {
      $lookup: {
        from: 'episodes',
        localField: 'episodeId',
        foreignField: '_id',
        as: 'epDoc',
      }
    },
    { $unwind: { path: '$epDoc', preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: {
          movieId: '$movieId',
          episodeNum: '$epDoc.episodeId',
          audioType: { $ifNull: ['$epDoc.audioType', 'unknown'] },
        },
        views: { $sum: 1 },
        totalWatchTime: { $sum: '$watchDuration' },
        uniqueUserSet: { $addToSet: { $ifNull: ['$userId', '$ipAddress'] } },
        viewerDetails: {
          $push: {
            userId: '$userId',
            watchMinutes: { $divide: ['$watchDuration', 60] },
          },
        },
      }
    },
    {
      $project: {
        _id: 1,
        views: 1,
        totalWatchTime: 1,
        uniqueViewers: { $size: '$uniqueUserSet' },
        viewerDetails: 1,
      }
    },
    { $sort: { '_id.movieId': 1, '_id.episodeNum': 1, '_id.audioType': 1 } },
  ]);

  // Map: movieId → [{ episodeNum, audioType, views, watchMinutes, uniqueViewers, viewerDetails }]
  const epStatsMap = new Map();
  episodeStatsWithAudio.forEach(e => {
    const mId = e._id.movieId.toString();
    if (!epStatsMap.has(mId)) epStatsMap.set(mId, []);
    epStatsMap.get(mId).push({
      episodeNum: e._id.episodeNum,
      audioType: e._id.audioType,
      views: e.views,
      watchMinutes: Math.round((e.totalWatchTime || 0) / 60),
      uniqueViewers: e.uniqueViewers,
      viewerDetails: e.viewerDetails || [],
    });
  });

  // 4. Aggregate per episode-number (sum across audio variants) — for "most watched episode"
  const epNumAggMap = new Map();
  episodeStatsWithAudio.forEach(e => {
    const mId = e._id.movieId.toString();
    const epNum = e._id.episodeNum;
    if (!epNumAggMap.has(mId)) epNumAggMap.set(mId, new Map());
    const epMap = epNumAggMap.get(mId);
    if (!epMap.has(epNum)) epMap.set(epNum, { views: 0, watchMinutes: 0, uniqueViewers: 0, viewerDetails: [] });
    const agg = epMap.get(epNum);
    agg.views += e.views;
    agg.watchMinutes += Math.round((e.totalWatchTime || 0) / 60);
    agg.uniqueViewers += e.uniqueViewers;
    agg.viewerDetails.push(...(e.viewerDetails || []));
  });

  // 5. Resolve user names for all viewers
  const allUserIds = new Set();
  episodeStatsWithAudio.forEach(e => (e.viewerDetails || []).forEach(v => { if (v.userId) allUserIds.add(v.userId.toString()); }));
  const uniqueUserIds = [...allUserIds];
  const users = uniqueUserIds.length > 0
    ? await UserModel.find({ _id: { $in: uniqueUserIds } }).select('_id username name avatar').lean()
    : [];
  const userMap = new Map(users.map(u => [u._id.toString(), u]));

  // 6. Assemble final result
  const result = aggregation.map((item, index) => {
    const m = movieMap.get(item._id.toString());
    const isTrending = item.velocity > 10;
    const isSeries = m && (
      m.type === 'series' || m.type === 'tvshows' || m.type === 'hoathinh' || (m.totalEpisodes || 0) > 1
    );
    const mId = item._id.toString();

    const audioTypes = [...new Set((epStatsMap.get(mId) || []).map(e => e.audioType).filter(Boolean))];

    // Group DB episodes by episodeNum
    const dbEps = seriesEpisodeMap.get(mId) || [];
    const epGrouped = new Map();
    dbEps.forEach(ep => {
      if (!epGrouped.has(ep.episodeId)) epGrouped.set(ep.episodeId, []);
      epGrouped.get(ep.episodeId).push(ep);
    });

    const episodeNumbers = [...new Set(dbEps.map(ep => ep.episodeId))].sort((a, b) => a - b);
    const episodeList = episodeNumbers.map(epNum => {
      const variants = epGrouped.get(epNum) || [];
      const statsForNum = epStatsMap.get(mId) || [];

      const variantDetails = variants.map(v => {
        const stat = statsForNum.find(s => s.episodeNum === epNum && s.audioType === v.audioType);
        // Top 3 viewers for this variant
        const topViewers = (stat?.viewerDetails || [])
          .filter(vd => vd.userId)
          .sort((a, b) => b.watchMinutes - a.watchMinutes)
          .slice(0, 3)
          .map(vd => {
            const u = userMap.get(vd.userId.toString());
            return {
              userId: vd.userId,
              name: u ? (u.name || u.username) : 'Ẩn danh',
              avatar: normalizeAvatarForOutput(u ? u.avatar : null, u ? (u.name || u.username) : vd.userId),
              watchMinutes: Math.round(vd.watchMinutes),
            };
          });

        return {
          audioType: v.audioType || 'unknown',
          serverName: v.serverName || null,
          slug: v.slug,
          views: stat ? stat.views : 0,
          watchMinutes: stat ? stat.watchMinutes : 0,
          uniqueViewers: stat ? stat.uniqueViewers : 0,
          topViewers,
        };
      });

      const agg = epNumAggMap.get(mId)?.get(epNum);
      return {
        episodeNum: epNum,
        views: variantDetails.reduce((s, v) => s + v.views, 0),
        watchMinutes: variantDetails.reduce((s, v) => s + v.watchMinutes, 0),
        uniqueViewers: variantDetails.reduce((s, v) => s + v.uniqueViewers, 0),
        variants: variantDetails,
      };
    });

    // Most watched episode (across all audio types)
    let topEpisode = null;
    if (episodeList.length > 0) {
      const top = [...episodeList].sort((a, b) => b.views - a.views)[0];
      const topVariant = [...top.variants].sort((a, b) => b.views - a.views)[0];
      topEpisode = {
        episodeNum: top.episodeNum,
        views: top.views,
        watchMinutes: top.watchMinutes,
        uniqueViewers: top.uniqueViewers,
        audioType: topVariant?.audioType || null,
        serverName: topVariant?.serverName || null,
      };
    }

    return {
      rank: index + 1,
      movieId: item._id,
      name: m ? m.name : 'Unknown',
      slug: m ? m.slug : '',
      poster: m ? (m.poster_url || m.thumb_url) : '',
      type: m ? m.type : 'single',
      totalEpisodes: isSeries ? (m.totalEpisodes || 0) : 0,
      views: item.views,
      watchMinutes: item.totalWatchTime,
      uniqueViewers: item.uniqueViewers,
      velocity: item.velocity,
      isTrending,
      ...(isSeries && {
        episodes: episodeList,
        audioTypes,
        topEpisode,
        totalEpisodeViews: m.totalEpisodeViews || 0,
        totalEpisodeWatchHours: Math.round((m.totalEpisodeWatchTime || 0) / 3600),
      }),
    };
  });

  return {
    data: result,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
};

/**
 * Get specific user's watch analytics
 * @param {string} userId - User's MongoDB _id
 * @returns {Promise<Object>} User's analytics data
 */
const getUserAnalytics = async (userId) => {
  const mongoose = require('mongoose');
  const ViewHistoryModel = require('../models/view_history.model');
  const MovieModel = require('../models/movie.model');

  // Try to convert to ObjectId; if it's not a valid 24-char hex string,
  // the aggregation will simply return no results (which is correct for custom IDs)
  let objectId = null;
  try {
    // Only attempt ObjectId conversion for valid hex strings
    if (/^[0-9a-fA-F]{24}$/.test(userId)) {
      objectId = new mongoose.Types.ObjectId(userId);
    }
  } catch (e) {
    // Not a valid ObjectId - return empty
    return { summary: { totalWatchMinutes: 0, moviesCount: 0 }, movies: [] };
  }

  if (!objectId) {
    return { summary: { totalWatchMinutes: 0, moviesCount: 0 }, movies: [] };
  }

  const aggregation = await ViewHistoryModel.aggregate([
    {
      $match: { userId: objectId },
    },
    {
      $group: {
        _id: '$movieId',
        watchMinutes: { $sum: { $divide: ['$watchDuration', 60] } },
        totalViews: { $sum: 1 },
        lastWatched: { $max: '$createdAt' }
      }
    },
    {
      $sort: { watchMinutes: -1 }
    }
  ]);

  if (!aggregation || aggregation.length === 0) {
    return { summary: { totalWatchMinutes: 0, moviesCount: 0 }, movies: [] };
  }

  const movieIds = aggregation.map(item => item._id);
  const movies = await MovieModel.find({ _id: { $in: movieIds } })
    .select('name slug poster_url thumb_url duration')
    .lean();

  const movieMap = new Map();
  movies.forEach(m => movieMap.set(m._id.toString(), m));

  let totalWatchMinutes = 0;

  const moviesResult = aggregation.map(item => {
    const m = movieMap.get(item._id.toString());
    const minutes = Math.round(item.watchMinutes);
    totalWatchMinutes += minutes;

    // Retention rate
    let retentionRate = 0;
    if (m && m.duration) {
      // Assuming m.duration is a string like "120 Phút" or "1 Tập"
      const durationMatch = String(m.duration).match(/\d+/);
      const totalMovieMinutes = durationMatch ? parseInt(durationMatch[0], 10) : 0;
      if (totalMovieMinutes > 0 && String(m.duration).toLowerCase().includes('phút')) {
        retentionRate = Math.min(100, Math.round((minutes / totalMovieMinutes) * 100));
      }
    }

    return {
      movieId: item._id,
      name: m ? m.name : 'Unknown',
      slug: m ? m.slug : '',
      poster: m ? (m.poster_url || m.thumb_url) : '',
      watchMinutes: minutes,
      totalViews: item.totalViews,
      lastWatched: item.lastWatched,
      retentionRate: retentionRate > 0 ? retentionRate : null
    };
  });

  return {
    summary: {
      totalWatchMinutes,
      moviesCount: moviesResult.length
    },
    movies: moviesResult
  };
};

// ─── Payment Transactions ──────────────────────────────────────

const getPaymentTransactions = async ({ status, from, to, search, packageId, page = 1, limit = 20 }) => {
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from + 'T00:00:00.000');
    if (to) filter.createdAt.$lte = new Date(to + 'T23:59:59.999');
  }

  if (packageId) {
    filter.packageId = packageId;
  }

  if (search) {
    const sanitized = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await UserModel.find({
      $or: [
        { username: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
      ],
    }).select('_id').lean();

    filter.user = { $in: users.map((u) => u._id) };
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    TransactionModel.find(filter)
      .populate('user', 'username name email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TransactionModel.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getPaymentStats = async () => {
  const stats = await TransactionModel.aggregate([
    { $match: { status: 'SUCCESS' } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalCoin: { $sum: { $add: ['$coinAmount', '$bonusCoin'] } },
        paidUserCount: { $addToSet: '$user' },
        successCount: { $sum: 1 },
      },
    },
  ]);

  if (stats.length === 0) {
    return { totalRevenue: 0, totalCoin: 0, paidUserCount: 0, successCount: 0 };
  }

  const { totalRevenue, totalCoin, paidUserCount, successCount } = stats[0];
  return { totalRevenue, totalCoin, paidUserCount: paidUserCount.length, successCount };
};

module.exports = {
  // Movies
  getAllMovies,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
  toggleMovieHidden,
  toggleMovieFeatured,
  hideAllMovies,
  unhideAllMovies,
  searchMovies,
  // Episodes
  updateEpisodesForMovies,
  updateQualityForMovies,
  getUpdatingMovies,
  // Users
  getAllUsers,
  getUserById,
  getUserAnalytics,
  createUser,
  updateUser,
  adjustUserCoins,
  deleteUser,
  toggleUserStatus,
  // Stats
  getStats,
  getChartData,
  getTrendingMovies,
  // Settings
  getTheme,
  setTheme,
  getSetting,
  setSetting,
  // Pricing
  seedPricingSettings,
  getCoinPackages,
  upsertCoinPackage,
  deleteCoinPackage,
  reorderCoinPackages,
  getPremiumPlans,
  upsertPremiumPlan,
  deletePremiumPlan,
  getPremiumPlanPrice,
  // Payments
  getPaymentTransactions,
  getPaymentStats,
};
