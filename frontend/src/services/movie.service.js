import apiRequest from "./utils/apiRequest";

const movieService = {
  /**
   * Lấy tất cả movies với pagination và filters
   * @param {Object} params - { page?, limit?, genre?, country?, year?, sort? }
   * @returns {Promise<Object>} { data: [], pagination: {} }
   */
  getAll: (params = {}) => apiRequest("/movies", { params }),

  /**
   * Lấy movie theo ID
   * @param {string|number} id - Movie ID
   * @returns {Promise<Object>} Movie object
   */
  getById: (id) => apiRequest(`/movies/${id}`),

  /**
   * Lấy trending movies (lượt xem gần đây)
   * @param {number} limit - Số lượng movies (default: 10, max: 50)
   * @param {Object} params - { type?: 'single'|'series', featured?: boolean }
   * @returns {Promise<Object>} { data: [] }
   */
  getTrending: (limit = 10, params = {}) =>
    apiRequest("/movies/trending/now", { params: { limit, ...params } }),

  /**
   * Lấy top rated movies
   * @param {number} limit - Số lượng movies (default: 10, max: 50)
   * @param {Object} params - { type?: 'single'|'series' }
   * @returns {Promise<Object>} { data: [] }
   */
  getTopRated: (limit = 10, params = {}) =>
    apiRequest("/movies/top/rated", { params: { limit, ...params } }),

  /**
   * Lấy new releases
   * @param {number} limit - Số lượng movies (default: 10, max: 50)
   * @param {Object} params - { type?: 'single'|'series' }
   * @returns {Promise<Object>} { data: [] }
   */
  getNewReleases: (limit = 10, params = {}) =>
    apiRequest("/movies/new/releases", { params: { limit, ...params } }),

  /**
   * Lấy personalized recommendations based on user's watch history
   * Requires authentication
   * @param {number} limit - Số lượng movies (default: 20)
   * @returns {Promise<Object>} { data: [] }
   */
  getForYou: (limit = 20) => apiRequest("/movies/for-you", { params: { limit }, requiresAuth: true }),

  /**
   * Lấy movies theo genre
   * @param {string} genre - Genre name
   * @param {Object} params - { page?, limit? }
   * @returns {Promise<Object>} { data: [], pagination: {} }
   */
  getByGenre: (genre, params = {}) => apiRequest(`/movies/genre/${genre}`, { params }),

  /**
   * Lấy movies theo country
   * @param {string} country - Country slug
   * @param {Object} params - { page?, limit? }
   * @returns {Promise<Object>} { data: [], pagination: {} }
   */
  getByCountry: (country, params = {}) => apiRequest(`/movies/country/${country}`, { params }),

  /**
   * Lấy movies theo type (single/series)
   * @param {'single'|'series'} type
   * @param {Object} params - { page?, limit? }
   */
  getByType: (type, params = {}) => apiRequest(`/movies/type/${type}`, { params }),

  /**
   * Lấy metadata filter (genres & countries)
   * Cached in localStorage for 1 hour
   * @returns {Promise<Object>} { genres: [], countries: [] }
   */
  getFilterOptions: (() => {
    const CACHE_KEY = "movie_filter_options_cache";
    const CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour in milliseconds
    let memoryCache = null;
    let cacheTimestamp = 0;

    const getCached = () => {
      // Check memory cache first
      const now = Date.now();
      if (memoryCache && now - cacheTimestamp < CACHE_EXPIRY) {
        return memoryCache;
      }

      // Check localStorage
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        if (now - timestamp < CACHE_EXPIRY) {
          // Update memory cache
          memoryCache = data;
          cacheTimestamp = timestamp;
          return data;
        }

        // Cache expired, remove it
        localStorage.removeItem(CACHE_KEY);
        return null;
      } catch (err) {
        console.error("Error reading filter options cache:", err);
        return null;
      }
    };

    const setCached = (data) => {
      try {
        const cacheData = {
          data,
          timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        // Update memory cache
        memoryCache = data;
        cacheTimestamp = cacheData.timestamp;
      } catch (err) {
        console.error("Error saving filter options cache:", err);
      }
    };

    return async () => {
      // Check cache first
      const cached = getCached();
      if (cached) {
        return cached;
      }

      // Cache miss - fetch from API
      const response = await apiRequest("/movies/meta/filters");
      const data = response?.data || response;

      // Cache the response
      setCached(data);

      return data;
    };
  })(),

  /**
   * Lấy top genres theo tổng lượt xem
   * @param {number} limit - Số lượng genres (default: 10)
   * @returns {Promise<Object>} { genres: [{ name, slug, totalViews }] }
   */
  getTopGenresByViews: (limit = 10) => apiRequest("/movies/meta/top-genres", { params: { limit } }),

  /**
   * Tìm kiếm movies
   * @param {string} query - Search query
   * @param {Object} params - { page?, limit? }
   * @returns {Promise<Object>} { data: [], pagination: {} }
   */
  search: (query, params = {}) =>
    apiRequest("/movies/search/query", {
      params: { q: query, ...params },
    }),

  /**
   * Lấy danh sách episodes của movie
   * @param {string|number} id - Movie ID
   * @param {number} season - Season number (optional)
   * @returns {Promise<Object>} { data: [] }
   */
  getEpisodes: (id, season) =>
    apiRequest(`/movies/${id}/episodes`, {
      params: season ? { season } : undefined,
    }),

  /**
   * Lấy cast của movie
   * @param {string|number} id - Movie ID
   * @returns {Promise<Object>} { data: [] }
   */
  getCast: (id) => apiRequest(`/movies/${id}/cast`),

  /**
   * Lấy comments của movie
   * @param {string|number} id - Movie ID
   * @param {Object} params - { page?, limit?, sort? }
   * @param {boolean} requiresAuth - Gửi token nếu user đã đăng nhập (optional)
   * @returns {Promise<Object>} { data: [], pagination: {} }
   */
  getComments: (id, params = {}, requiresAuth = false) =>
    apiRequest(`/movies/${id}/comments`, { params, requiresAuth }),

  /**
   * Đăng comment cho movie (yêu cầu auth)
   * @param {string|number} id - Movie ID
   * @param {Object} commentData - { content, rating?, episode?, isSpoiler? }
   * @returns {Promise<Object>} Comment object
   */
  postComment: (id, commentData) =>
    apiRequest(`/movies/${id}/comments`, {
      method: "POST",
      data: commentData,
      requiresAuth: true,
    }),

  /**
   * Tăng view count cho movie (không yêu cầu auth)
   * @param {string|number} id - Movie ID
   * @param {string|number} episodeId - Episode ID
   * @returns {Promise<Object>} { message, viewCount, movieId }
   */
  incrementView: (id, episodeId) =>
    apiRequest(`/movies/${id}/view`, {
      method: "POST",
      data: { episodeId },
      requiresAuth: true,
    }),

  /**
   * Ghi nhận thời lượng xem (heartbeat 30s)
   * @param {string} id - Movie ID hoặc slug
   * @param {string} viewHistoryId - ID của bản ghi ViewHistory
   * @param {number} seconds - Số giây đã xem (mặc định 30)
   * @param {string|null} episodeId - Episode ID hiện tại để gắn heartbeat đúng tập
   * @returns {Promise<Object>} { success: true, viewHistoryId, streak? }
   */
  recordWatchTime: (id, viewHistoryId, seconds = 30, episodeId = null, playback = {}) => {
    const data = { viewHistoryId, seconds, episodeId };
    if (Number.isFinite(playback.watchTime)) {
      data.watchTime = Math.floor(playback.watchTime);
    }
    if (Number.isFinite(playback.duration)) {
      data.duration = Math.floor(playback.duration);
    }

    return apiRequest(`/movies/${id}/watch-time`, {
      method: "POST",
      data,
      requiresAuth: true,
    });
  },

  /**
   * Đánh giá movie (yêu cầu auth)
   * @param {string|number} id - Movie ID
   * @param {number} rating - Rating từ 1-10
   * @returns {Promise<Object>} { message }
   */
  rateMovie: (id, rating) =>
    apiRequest(`/movies/${id}/rate`, {
      method: "POST",
      data: { rating },
      requiresAuth: true,
    }),

  /**
   * Lấy danh sách ratings của movie
   * @param {string|number} id - Movie ID
   * @param {Object} params - { page?, limit? }
   * @returns {Promise<Object>} { data: [], pagination: {} }
   */
  getRatings: (id, params = {}) =>
    apiRequest(`/movies/${id}/ratings`, {
      params,
    }),

  /**
   * Lấy danh sách phim gợi ý dựa trên một phim
   * @param {string|number} id - Movie ID
   * @param {number} limit - Số lượng phim gợi ý (default: 10)
   * @returns {Promise<Object>} { data: [] }
   */
  getRecommendations: (id, limit = 10) =>
    apiRequest(`/movies/${id}/recommendations`, {
      params: { limit },
    }),

  /**
   * Like một comment (yêu cầu auth)
   * @param {string} commentId - Comment ID
   * @param {boolean} isCurrentlyLiked - Trạng thái like hiện tại
   * @param {boolean} isCurrentlyDisliked - Trạng thái dislike hiện tại
   * @returns {Promise<Object>} { message, likes, dislikes }
   */
  likeComment: (commentId, isCurrentlyLiked = false, isCurrentlyDisliked = false) =>
    apiRequest(`/comments/${commentId}/like`, {
      method: "POST",
      data: { isCurrentlyLiked, isCurrentlyDisliked },
      requiresAuth: true,
    }),

  /**
   * Dislike một comment (yêu cầu auth)
   * @param {string} commentId - Comment ID
   * @param {boolean} isCurrentlyDisliked - Trạng thái dislike hiện tại
   * @param {boolean} isCurrentlyLiked - Trạng thái like hiện tại
   * @returns {Promise<Object>} { message, likes, dislikes }
   */
  dislikeComment: (commentId, isCurrentlyDisliked = false, isCurrentlyLiked = false) =>
    apiRequest(`/comments/${commentId}/dislike`, {
      method: "POST",
      data: { isCurrentlyDisliked, isCurrentlyLiked },
      requiresAuth: true,
    }),

  /**
   * Xóa một comment (yêu cầu auth, chỉ có thể xóa comment của chính mình)
   * @param {string} commentId - Comment ID
   * @returns {Promise<Object>} { message, commentId }
   */
  deleteComment: (commentId) =>
    apiRequest(`/comments/${commentId}`, {
      method: "DELETE",
      requiresAuth: true,
    }),
};

/**
 * Helper Functions
 * Functions tương thích ngược cho các component đã dùng
 */

/**
 * Fetch movie by ID (Helper function)
 * @param {string|number} movieId - Movie ID
 * @returns {Promise<Object>} Movie object
 */
export async function fetchMovieById(movieId) {
  try {
    const data = await movieService.getById(movieId);
    // Handle response format: could be { data: {...} } or direct object
    return data?.data || data;
  } catch (error) {
    console.error("Error fetching movie:", error);
    throw error;
  }
}

/**
 * Fetch episodes (Helper function)
 * @param {string|number} movieId - Movie ID
 * @param {number} season - Season number (optional)
 * @returns {Promise<Array>} Episodes array
 */
export async function fetchEpisodes(movieId, season) {
  try {
    const data = await movieService.getEpisodes(movieId, season);
    // Handle response format: could be { data: [...] } or direct array
    return data?.data || data || [];
  } catch (error) {
    console.error("Error fetching episodes:", error);
    throw error;
  }
}

movieService.getTrendingSocial = () => apiRequest("/movies/trending-social");

export default movieService;
