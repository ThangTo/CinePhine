const adminService = require('../services/admin.service');
const analyticsService = require('../services/analytics.service');
const { transformMovieData, slugify } = require('../utils/movieAdminUtils');
const { transformMovie } = require('../utils/movieTransformer');
const Settings = require('../models/Settings');
const Episode = require('../models/episode.model');
const { normalizeRemoteWhisperUrl } = require('../services/whisperClient.service');

/**
 * Helper: Parse array query parameters (genres, countries)
 * @param {string|string[]} param - Query parameter value
 * @returns {string[]|undefined} Parsed array or undefined
 */
const parseArrayParam = (param) => {
  if (!param) return undefined;
  return Array.isArray(param) ? param : param.split(',').filter(Boolean);
};

/**
 * Admin Movies Controllers
 */

/**
 * GET /admin/colab-url
 * Get current Colab Whisper URL
 */
const getColabUrl = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'colab_whisper_url' });
    res.json({ success: true, url: setting ? setting.value : '' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const DEFAULT_FEATURE_PERMISSIONS = {
  download_movie: { requiresPremium: false },
  korean_subtitles: { requiresPremium: false },
};

/**
 * GET /api/v1/settings/features (Public) & /admin/settings/features
 * Get feature permissions
 */
const getFeaturePermissions = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'feature_permissions' });
    const value = setting ? setting.value : DEFAULT_FEATURE_PERMISSIONS;
    res.json({ success: true, data: value });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /admin/settings/features
 * Update feature permissions
 */
const updateFeaturePermissions = async (req, res) => {
  try {
    const { features } = req.body;
    if (!features || typeof features !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid features data' });
    }

    const updatedSetting = await Settings.findOneAndUpdate(
      { key: 'feature_permissions' },
      { 
        value: features,
        description: 'Permissions for user features (e.g. requiresPremium)'
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: updatedSetting.value, message: 'Feature permissions updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /admin/subtitles/requests
 * Get episodes requiring subtitles sorted by request count
 */
const getSubtitleRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const episodes = await Episode.find({ subtitleRequestCount: { $gt: 0 } })
      .populate('movieId', 'title name slug thumb_url')
      .sort({ subtitleRequestCount: -1, updatedAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const total = await Episode.countDocuments({ subtitleRequestCount: { $gt: 0 } });

    res.json({
      success: true,
      data: episodes,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /admin/colab-url
 * Update Colab Whisper URL
 */
const updateColabUrl = async (req, res) => {
  try {
    const { url } = req.body;
    const normalizedUrl = normalizeRemoteWhisperUrl(url);
    await Settings.findOneAndUpdate(
      { key: 'colab_whisper_url' },
      { 
        value: normalizedUrl,
        description: 'Google Colab Ngrok URL for Whisper Large-v3'
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Updated Colab Whisper URL successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /admin/movies
 * Get all movies with pagination and filters
 */
const getAllMovies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
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
    } = req.query;

    // Parse array params (genres, countries)
    const parsedGenres = parseArrayParam(genres);
    const parsedCountries = parseArrayParam(countries);

    const result = await adminService.getAllMovies({
      page,
      limit,
      search,
      genres: parsedGenres,
      countries: parsedCountries,
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
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/movies/:id
 * Get movie by ID
 */
const getMovieById = async (req, res) => {
  try {
    const { id } = req.params;
    const movie = await adminService.getMovieById(id);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }
    // Transform movie to frontend format before sending
    const transformedMovie = transformMovie(movie);
    res.json(transformedMovie);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/movies
 * Create new movie
 */
const createMovie = async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.name && !req.body.title) {
      return res.status(400).json({ message: 'Movie name is required' });
    }

    // Transform data from frontend format to DB format
    const transformedData = transformMovieData(req.body, false);

    // Create movie (service will handle slug uniqueness)
    const movie = await adminService.createMovie(transformedData);
    // Transform movie to frontend format before sending
    const transformedMovie = transformMovie(movie);
    res.status(201).json(transformedMovie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * PUT /admin/movies/:id
 * Update movie
 */
const updateMovie = async (req, res) => {
  try {
    const { id } = req.params;

    // Transform data from frontend format to DB format
    const transformedData = transformMovieData(req.body, true);

    // Handle slug generation if name changed but slug not provided
    const existingMovie = await adminService.getMovieById(id);
    if (!existingMovie) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    const newName = transformedData.name || req.body.title;
    if (newName && newName !== existingMovie.name && !transformedData.slug && !req.body.slug) {
      // Name changed but slug not provided, generate new slug
      transformedData.slug = slugify(newName);
    }

    // Update movie (service will handle slug uniqueness)
    const movie = await adminService.updateMovie(id, transformedData);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }
    // Transform movie to frontend format before sending
    const transformedMovie = transformMovie(movie);
    res.json(transformedMovie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * DELETE /admin/movies/:id
 * Delete movie
 */
const deleteMovie = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.deleteMovie(id);
    res.json({ success: true, message: 'Movie deleted successfully' });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * PATCH /admin/movies/:id/toggle-hidden
 * Toggle movie hidden status (hide/unhide)
 */
const toggleMovieHidden = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.toggleMovieHidden(id);
    res.json(result);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * PATCH /admin/movies/:id/toggle-featured
 * Toggle movie featured status (pin/unpin to banner)
 */
const toggleMovieFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.toggleMovieFeatured(id);
    res.json(result);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * POST /admin/movies/hide-all
 * Hide all movies
 */
const hideAllMovies = async (req, res) => {
  try {
    const result = await adminService.hideAllMovies();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/movies/unhide-all
 * Unhide all movies
 */
const unhideAllMovies = async (req, res) => {
  try {
    const result = await adminService.unhideAllMovies();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/movies/search
 * Search movies
 */
const searchMovies = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    const result = await adminService.searchMovies(q, { page, limit });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Admin Users Controllers
 */

/**
 * GET /admin/users
 * Get all users with pagination and filters
 */
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const result = await adminService.getAllUsers({ page, limit, search });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/users/:id
 * Get user by ID
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await adminService.getUserById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/users
 * Create new user
 */
const createUser = async (req, res) => {
  try {
    const user = await adminService.createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * PUT /admin/users/:id
 * Update user
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await adminService.updateUser(id, req.body);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /admin/users/:id/coins
 * Adjust user coins manually (admin only)
 */
const adjustUserCoins = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.adjustUserCoins(id, req.body);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message });
  }
};

/**
 * DELETE /admin/users/:id
 * Delete user
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.deleteUser(id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

/**
 * PATCH /admin/users/:id/toggle-status
 * Toggle user status (active/inactive)
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await adminService.toggleUserStatus(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Admin Stats Controllers
 */

/**
 * GET /admin/stats
 * Get dashboard statistics
 */
const getStats = async (req, res) => {
  try {
    const stats = await adminService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/stats/charts/:type
 * Get chart data
 */
const getChartData = async (req, res) => {
  try {
    const { type } = req.params;
    const chartData = await adminService.getChartData(type);
    res.json(chartData);
  } catch (error) {
    console.error(`Error in getChartData (${req.params.type}):`, error);
    res.status(500).json({ message: error.message });
  }
};

// GET /admin/analytics/realtime
const getRealtimeActiveUsers = async (req, res) => {
  try {
    const count = await analyticsService.getRealtimeActiveUsers();
    res.status(200).json({ success: true, count });
  } catch (error) {
    console.error('Error fetching realtime active users:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /admin/analytics/visits
const getRealtimeVisits = async (req, res) => {
  try {
    const data = await analyticsService.getVisitsStats();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching realtime visits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /admin/analytics/locations
const getAnalyticsLocations = async (req, res) => {
  try {
    const { period = 'realtime' } = req.query; // 'realtime', 'today', 'week', 'month'
    const locations = await analyticsService.getLocationsByPeriod(period);
    res.status(200).json({ success: true, count: locations.length, locations });
  } catch (error) {
    console.error('Error fetching analytics locations:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /admin/movies/crawl/by-page
 * Crawl movies by page range with Server-Sent Events for real-time logs
 */
const crawlMoviesByPage = async (req, res) => {
  try {
    const { startPage = 1, endPage = null, skipExisting = false } = req.body;
    const { runPageRange } = require('../services/crawler.service');

    if (!startPage || startPage < 1) {
      return res.status(400).json({ message: 'Invalid start page' });
    }

    if (endPage && (endPage < 1 || startPage > endPage)) {
      return res.status(400).json({ message: 'Invalid page range' });
    }

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Progress callback to send logs
    const onProgress = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Run crawl in background
    runPageRange(
      parseInt(startPage),
      endPage ? parseInt(endPage) : null,
      onProgress,
      skipExisting === true,
    )
      .then((result) => {
        res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
        res.end();
      })
      .catch((error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/movies/crawl/search
 * Search movies by name (advanced filters)
 */
const searchMoviesForCrawl = async (req, res) => {
  try {
    const { movieName, page, sort_field, sort_type, sort_lang, category, country, year, limit } =
      req.body;
    const { searchMovies } = require('../services/crawler.service');

    if (!movieName || !movieName.trim()) {
      return res.status(400).json({ message: 'Movie name is required' });
    }

    const options = {
      page,
      sort_field,
      sort_type,
      sort_lang,
      category,
      country,
      year,
      limit,
    };

    const movies = await searchMovies(movieName.trim(), options);
    res.json({ movies });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/movies/crawl/by-genre
 * Search movies by genre/category
 */
const searchMoviesByGenre = async (req, res) => {
  try {
    const { type_list, page, sort_field, sort_type, sort_lang, country, year, limit } = req.body;
    const { searchMoviesByGenre } = require('../services/crawler.service');

    if (!type_list || !type_list.trim()) {
      return res.status(400).json({ message: 'Genre type_list is required' });
    }

    // Chỉ truyền các tham số có giá trị (không truyền undefined hoặc empty string)
    const options = {
      page: page || 1,
      sort_field: sort_field || '_id',
      sort_type: sort_type || 'asc',
      limit: limit || 10,
    };

    // Chỉ thêm các tham số optional nếu có giá trị
    if (sort_lang && sort_lang.trim()) {
      options.sort_lang = sort_lang.trim();
    }
    if (country && country.trim()) {
      options.country = country.trim();
    }
    if (year && year.toString().trim()) {
      options.year = year.toString().trim();
    }

    const movies = await searchMoviesByGenre(type_list.trim(), options);

    res.json({ movies: movies || [] });
  } catch (error) {
    console.error('Error in searchMoviesByGenre controller:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      message: error.message || 'Failed to search movies by genre',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * POST /admin/movies/crawl/by-slug
 * Crawl a single movie by slug
 */
const crawlMovieBySlug = async (req, res) => {
  try {
    const { slug } = req.body;
    const { crawlMovieBySlug } = require('../services/crawler.service');
    const { transformMovie } = require('../utils/movieTransformer');

    if (!slug || !slug.trim()) {
      return res.status(400).json({ message: 'Movie slug is required' });
    }

    const result = await crawlMovieBySlug(slug.trim());

    if (!result.success) {
      return res.status(400).json({ message: result.message || 'Failed to crawl movie' });
    }

    // Transform movie data to frontend format
    const transformedMovie = result.movieData ? transformMovie(result.movieData) : null;

    res.json({
      success: true,
      message: `Successfully ${result.isUpdate ? 'updated' : 'created'} movie: ${result.movie}`,
      movie: transformedMovie,
      episodes: result.episodes,
      isUpdate: result.isUpdate,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/settings/theme
 * Get current theme setting
 */
const getTheme = async (req, res) => {
  try {
    const theme = await adminService.getTheme();
    res.json({ theme });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /admin/settings/theme
 * Update theme setting
 */
const setTheme = async (req, res) => {
  try {
    const { theme } = req.body;
    if (!theme) {
      return res.status(400).json({ message: 'Theme is required' });
    }
    await adminService.setTheme(theme);
    res.json({ message: 'Theme updated successfully', theme });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Pricing Controllers ────────────────────────────────────────────────────────

/**
 * GET /admin/pricing/coin-packages
 * Get all coin packages
 */
const getCoinPackages = async (req, res) => {
  try {
    const packages = await adminService.getCoinPackages();
    res.json({ data: packages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/pricing/coin-packages
 * Add or update a coin package
 */
const upsertCoinPackage = async (req, res) => {
  try {
    const { id, amount, bonus, label, price, sortOrder } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Số coin phải lớn hơn 0' });
    }
    if (!price || Number(price) <= 0) {
      return res.status(400).json({ message: 'Giá tiền phải lớn hơn 0' });
    }
    const pkg = {
      id,
      amount: Number(amount),
      bonus: Number(bonus) || 0,
      label: label || `${Number(amount) + (Number(bonus) || 0)} coin`,
      price: Number(price),
      sortOrder: Number(sortOrder) || 99,
    };
    const packages = await adminService.upsertCoinPackage(pkg);
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /admin/pricing/coin-packages/:id
 * Delete a coin package
 */
const deleteCoinPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const packages = await adminService.deleteCoinPackage(id);
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /admin/pricing/coin-packages/reorder
 * Reorder coin packages
 */
const reorderCoinPackages = async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ message: 'orderedIds phải là một mảng' });
    }
    const packages = await adminService.reorderCoinPackages(orderedIds);
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/pricing/premium-plans
 * Get all premium plans
 */
const getPremiumPlans = async (req, res) => {
  try {
    const plans = await adminService.getPremiumPlans();
    res.json({ data: plans });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/pricing/premium-plans
 * Add or update a premium plan
 */
const upsertPremiumPlan = async (req, res) => {
  try {
    const { id, planKey, label, days, coins, sortOrder } = req.body;
    if (!planKey || !label || !days || !coins) {
      return res.status(400).json({ message: 'planKey, label, days, coins là bắt buộc' });
    }
    if (Number(coins) <= 0 || Number(days) <= 0) {
      return res.status(400).json({ message: 'days và coins phải lớn hơn 0' });
    }
    const plan = {
      id,
      planKey: planKey.trim().toLowerCase().replace(/\s+/g, '_'),
      label: label.trim(),
      days: Number(days),
      coins: Number(coins),
      sortOrder: Number(sortOrder) || undefined,
    };
    const plans = await adminService.upsertPremiumPlan(plan);
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /admin/pricing/premium-plans/:id
 * Delete a premium plan
 */
const deletePremiumPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const plans = await adminService.deletePremiumPlan(id);
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/pricing/seed
 * Seed default pricing (safe to call multiple times)
 */
const seedPricingSettings = async (req, res) => {
  try {
    await adminService.seedPricingSettings();
    res.json({ success: true, message: 'Đã seed pricing mặc định' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/movies/updating
 * Get movies for update modal (episodes, quality, or thumbnails tab)
 */
const getUpdatingMovies = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, quality, tab } = req.query;
    const result = await adminService.getUpdatingMovies({ page, limit, search, quality, tab });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/movies/update-episodes
 * Update episodes for selected movies
 */
const updateEpisodesForMovies = async (req, res) => {
  try {
    const { movieIds, onlyNewEpisodes = false } = req.body;

    if (!movieIds || !Array.isArray(movieIds) || movieIds.length === 0) {
      return res.status(400).json({ message: 'Movie IDs array is required' });
    }

    // Set up Server-Sent Events for real-time progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Flush headers immediately
    res.flushHeaders();

    // Progress callback to send logs
    const onProgress = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Flush response to send data immediately
      if (typeof res.flush === 'function') {
        res.flush();
      }
    };

    // Run update in background
    adminService
      .updateEpisodesForMovies(movieIds, onProgress, onlyNewEpisodes)
      .then((result) => {
        res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
        res.end();
      })
      .catch((error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/movies/update-quality
 * Update quality for CAM movies (upgrade to HD)
 */
const updateQualityForMovies = async (req, res) => {
  try {
    const { movieIds } = req.body;

    if (!movieIds || !Array.isArray(movieIds) || movieIds.length === 0) {
      return res.status(400).json({ message: 'Movie IDs array is required' });
    }

    // Set up Server-Sent Events for real-time progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Flush headers immediately
    res.flushHeaders();

    // Progress callback to send logs
    const onProgress = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Flush response to send data immediately
      if (typeof res.flush === 'function') {
        res.flush();
      }
    };

    // Run update in background
    adminService
      .updateQualityForMovies(movieIds, onProgress)
      .then((result) => {
        res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
        res.end();
      })
      .catch((error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/users/:id/analytics
 * Get specific user's watch analytics
 */
const getUserAnalytics = async (req, res) => {
  try {
    const analytics = await adminService.getUserAnalytics(req.params.id);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/analytics/trending
 * Get top trending movies by timeframe (today, week, month)
 */
const getTrendingMovies = async (req, res) => {
  try {
    const { timeframe, page = 1, limit = 10 } = req.query;
    const trending = await adminService.getTrendingMovies(timeframe, page, limit);
    res.json(trending);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/analytics/historical
 * Get historical visits grouped by granularity (day|week|month|year)
 * Query: ?granularity=day&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
const getHistoricalVisits = async (req, res) => {
  try {
    const { granularity = 'day', from, to } = req.query;
    const validGranularities = ['day', 'week', 'month', 'year'];
    if (!validGranularities.includes(granularity)) {
      return res.status(400).json({ message: 'Invalid granularity. Use: day, week, month, year' });
    }
    const data = await analyticsService.getHistoricalStats({ granularity, from, to });
    res.status(200).json({ success: true, granularity, from, to, data });
  } catch (error) {
    console.error('Error in getHistoricalVisits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /admin/analytics/summary
 * Get all-time cumulative visitor totals from MongoDB
 */
const getAnalyticsSummary = async (req, res) => {
  try {
    const summary = await analyticsService.getAllTimeSummary();
    res.status(200).json({ success: true, summary });
  } catch (error) {
    console.error('Error in getAnalyticsSummary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /admin/analytics/unique
 * Get TRUE unique visitor stats per period
 * Query: ?granularity=day|week|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
const getUniqueVisits = async (req, res) => {
  try {
    const { granularity = 'day', from, to } = req.query;
    const validGranularities = ['day', 'week', 'month', 'year'];
    if (!validGranularities.includes(granularity)) {
      return res.status(400).json({ message: 'Invalid granularity. Use: day, week, month, year' });
    }
    const data = await analyticsService.getUniqueStats({ granularity, from, to });
    res.status(200).json({ success: true, granularity, from, to, data });
  } catch (error) {
    console.error('Error in getUniqueVisits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /admin/analytics/unique-summary
 * Get all-time unique visitor totals from PeriodAnalytics
 */
const getUniqueAnalyticsSummary = async (req, res) => {
  try {
    const summary = await analyticsService.getAllTimeUniqueSummary();
    res.status(200).json({ success: true, summary });
  } catch (error) {
    console.error('Error in getUniqueAnalyticsSummary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /admin/users/:id/streak
 * Get specific user's watch streak (admin only)
 */
const getUserStreak = async (req, res) => {
  try {
    const watchStreakService = require('../services/watchStreak.service');
    const streak = await watchStreakService.getStreak(req.params.id);
    if (!streak) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(streak);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/users/:id/quests
 * Get specific user's quest summary (daily & weekly progress)
 */
const getUserQuestSummary = async (req, res) => {
  try {
    const questService = require('../services/quest.service');
    const summary = await questService.getQuestSummary(req.params.id);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const VALID_STATUSES = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED'];

const getPaymentTransactions = async (req, res) => {
  try {
    const { status, from, to, search, packageId, page: pageRaw, limit: limitRaw } = req.query;

    const statusClean = VALID_STATUSES.includes(status) ? status : undefined;
    const fromClean = from && !isNaN(new Date(from).getTime()) ? from : undefined;
    const toClean = to && !isNaN(new Date(to).getTime()) ? to : undefined;
    const page = Math.max(1, parseInt(pageRaw) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitRaw) || 20));

    const result = await adminService.getPaymentTransactions({
      status: statusClean,
      from: fromClean,
      to: toClean,
      search,
      packageId,
      page,
      limit,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPaymentStats = async (req, res) => {
  try {
    const data = await adminService.getPaymentStats();
    res.json({ data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPaymentConfig = async (req, res) => {
  try {
    const enabled = await adminService.getSetting('payment_enabled');
    res.json({ success: true, data: { enabled: enabled !== false } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updatePaymentConfig = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean' });
    }
    await adminService.setSetting('payment_enabled', enabled, 'Global payment toggle');
    res.json({ success: true, data: { enabled } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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
  getUpdatingMovies,
  updateEpisodesForMovies,
  updateQualityForMovies,

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
  getRealtimeActiveUsers,
  getRealtimeVisits,
  getAnalyticsLocations,
  getTrendingMovies,
  getHistoricalVisits,
  getAnalyticsSummary,
  getUniqueVisits,
  getUniqueAnalyticsSummary,

  // Crawl
  crawlMoviesByPage,
  searchMoviesForCrawl,
  searchMoviesByGenre,
  crawlMovieBySlug,

  // Settings
  getTheme,
  setTheme,
  getFeaturePermissions,
  updateFeaturePermissions,

  // Pricing
  getCoinPackages,
  upsertCoinPackage,
  deleteCoinPackage,
  reorderCoinPackages,
  getPremiumPlans,
  upsertPremiumPlan,
  deletePremiumPlan,
  seedPricingSettings,

  // User Streak
  getUserStreak,
  getUserQuestSummary,

  // Remote Whisper
  getColabUrl,
  updateColabUrl,
  getSubtitleRequests,

  // Payments
  getPaymentTransactions,
  getPaymentStats,
  getPaymentConfig,
  updatePaymentConfig,
};
