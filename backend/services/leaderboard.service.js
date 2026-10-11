/**
 * Leaderboard Service
 * Computes and caches the public top users leaderboard.
 *
 * Cache: leaderboard:topUsers:v6:<yyyy-mm-dd> (TTL: 3600s)
 * Order: users with currentStreak > 0 first, then by score.
 * Score formula:
 * watchMinutes + 500 * log2(currentStreak + 1) + 150 * log2(maxStreak + 1)
 */

const mongoose = require('mongoose');
const redisService = require('./redis.service');
const watchStreakService = require('./watchStreak.service');
const { normalizeAvatarForOutput } = require('../utils/avatarUtils');
const premiumService = require('./premium.service');

const CACHE_KEY_PREFIX = 'leaderboard:topUsers:v6';
const CACHE_TTL = 3600; // 1 hour
const LEADERBOARD_LIMIT = 10;
const PUBLIC_USER_ROLES = ['user', 'premium'];
const WATCH_SECONDS_PER_MINUTE = 60;
const CURRENT_STREAK_SCORE_WEIGHT = 500;
const MAX_STREAK_SCORE_WEIGHT = 150;

const toNonNegativeNumber = (value) => Math.max(0, Number(value) || 0);

const calculateScore = ({ totalWatchTime, currentStreak, maxStreak }) => {
  const watchMinutes = toNonNegativeNumber(totalWatchTime) / WATCH_SECONDS_PER_MINUTE;
  const currentStreakScore =
    CURRENT_STREAK_SCORE_WEIGHT * Math.log2(toNonNegativeNumber(currentStreak) + 1);
  const maxStreakScore =
    MAX_STREAK_SCORE_WEIGHT * Math.log2(toNonNegativeNumber(maxStreak) + 1);

  return Math.round(watchMinutes + currentStreakScore + maxStreakScore);
};

const getCacheDateSegment = (referenceDate = new Date()) => {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getCacheKey = (referenceDate = new Date()) =>
  `${CACHE_KEY_PREFIX}:${getCacheDateSegment(referenceDate)}`;

/**
 * Build the leaderboard with current streak derived from the same helper
 * used by the watch streak feature, so stale streaks drop to 0 automatically.
 *
 * @returns {Promise<Array>} Array of leaderboard entries
 */
const getTopUsers = async (referenceDate = new Date()) => {
  const User = mongoose.model('User');
  const ViewHistory = mongoose.model('ViewHistory');
  const [users, watchStats] = await Promise.all([
    User.find({
      role: { $in: PUBLIC_USER_ROLES },
    })
      .select('username avatar role premiumPlan premiumExpiresAt watchStreak longestStreak lastQualifiedWatchDate lastWatchDate')
      .lean(),
    ViewHistory.aggregate([
      {
        $match: {
          userId: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalWatchTime: { $sum: '$watchDuration' },
        },
      },
    ]),
  ]);

  const watchTimeByUserId = new Map(
    watchStats.map((item) => [item._id.toString(), Number(item.totalWatchTime) || 0]),
  );

  return users
    .map((user) => {
      const totalWatchTime = watchTimeByUserId.get(user._id.toString()) || 0;
      const currentStreak = watchStreakService.getCurrentStreakValue(user, referenceDate);
      const maxStreak = Number(user.longestStreak) || 0;
      const score = calculateScore({ totalWatchTime, currentStreak, maxStreak });

      const premiumUser = premiumService.normalizePremiumSnapshot(user, referenceDate);

      return {
        id: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        role: premiumUser.role || 'user',
        isPremium: premiumUser.isPremium,
        premiumPlan: premiumUser.premiumPlan || null,
        premiumExpiresAt: premiumUser.premiumExpiresAt || null,
        totalWatchTime,
        currentStreak,
        maxStreak,
        score,
      };
    })
    .sort((left, right) => {
      // Active streaks always rank above broken ones, whatever the score.
      const activeDiff = Number(right.currentStreak > 0) - Number(left.currentStreak > 0);
      if (activeDiff !== 0) return activeDiff;
      if (right.score !== left.score) return right.score - left.score;
      if (right.totalWatchTime !== left.totalWatchTime) {
        return right.totalWatchTime - left.totalWatchTime;
      }
      if (right.maxStreak !== left.maxStreak) return right.maxStreak - left.maxStreak;
      if (right.currentStreak !== left.currentStreak) {
        return right.currentStreak - left.currentStreak;
      }
      return String(left.username || '').localeCompare(String(right.username || ''));
    })
    .slice(0, LEADERBOARD_LIMIT);
};

/**
 * Cache-first public API.
 *
 * @returns {Promise<Array>}
 */
const getTopUsersLeaderboard = async () => {
  const cacheKey = getCacheKey();

  try {
    const cached = await redisService.get(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (_error) {
    // Ignore Redis errors and fall back to the DB query below.
  }

  const result = (await getTopUsers()).map((entry) => ({
    ...entry,
    avatar: normalizeAvatarForOutput(entry.avatar, entry.username || entry.id),
  }));

  try {
    await redisService.set(cacheKey, result, CACHE_TTL);
  } catch (_error) {
    // Ignore cache-write errors because the response is already available.
  }

  return result;
};

/**
 * Invalidates every leaderboard cache version.
 *
 * @returns {Promise<boolean>}
 */
const invalidateLeaderboardCache = async () => {
  const deletedCount = await redisService.delByPattern('leaderboard:topUsers*');
  return deletedCount > 0;
};

module.exports = {
  getTopUsersLeaderboard,
  invalidateLeaderboardCache,
  getCacheKey,
};
