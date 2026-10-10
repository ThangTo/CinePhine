const moment = require('moment-timezone');
const User = require('../models/user.model');
const coinLedgerService = require('./coinLedger.service');

const FORTUNE_TIMEZONE = 'Asia/Ho_Chi_Minh';

// Must match FORTUNE_TIERS in frontend/src/components/common/HalloweenFortune.jsx.
// Expected value is about 20 coins per day, roughly two daily quests.
const FORTUNE_TIERS = [
  { tier: 'dai-cat', name: 'Đại Cát', chance: 5, coins: 100 },
  { tier: 'cat', name: 'Cát', chance: 25, coins: 30 },
  { tier: 'binh', name: 'Bình', chance: 50, coins: 10 },
  { tier: 'hung', name: 'Hung', chance: 20, coins: 1 },
];

const createFortuneError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * Pick a tier from a random number in [0, 1).
 * A charmed draw (yesterday was Hung) only rolls among the good tiers.
 * @param {number} random
 * @param {boolean} charmed
 * @returns {{tier: string, name: string, chance: number, coins: number}}
 */
const pickFortuneTier = (random, charmed = false) => {
  const pool = charmed ? FORTUNE_TIERS.filter((item) => item.coins >= 30) : FORTUNE_TIERS;
  let left = random * pool.reduce((sum, item) => sum + item.chance, 0);
  return pool.find((item) => (left -= item.chance) < 0) || pool[pool.length - 1];
};

const toResult = (fortune, coinBalance, alreadyDrawn) => ({ ...fortune, coinBalance, alreadyDrawn });

const readTodayFortune = async (userId) => {
  const user = await User.findById(userId).select('halloweenFortune coin').lean();
  return toResult(user?.halloweenFortune, user?.coin, true);
};

/**
 * Draw today's Halloween fortune candy. One draw per user per Vietnam day;
 * calling again the same day returns the stored result.
 * @param {string} userId
 * @param {Date} [now]
 * @returns {Promise<Object>}
 */
const drawHalloweenFortune = async (userId, now = new Date()) => {
  const day = moment(now).tz(FORTUNE_TIMEZONE);
  const dateKey = day.format('YYYY-MM-DD');
  const yesterdayKey = day.clone().subtract(1, 'day').format('YYYY-MM-DD');

  const user = await User.findById(userId).select('halloweenFortune coin').lean();
  if (!user) {
    throw createFortuneError('User not found', 404);
  }

  const previous = user.halloweenFortune;
  if (previous?.dateKey === dateKey) {
    return toResult(previous, user.coin, true);
  }

  const charmed = previous?.dateKey === yesterdayKey && previous.tier === 'hung';
  const { tier, name, coins } = pickFortuneTier(Math.random(), charmed);
  const fortune = { dateKey, tier, coins, charmed, pick: Math.floor(Math.random() * 1000) };

  // The dateKey condition is the daily lock: only one concurrent request can write today's draw.
  const locked = await User.findOneAndUpdate(
    { _id: userId, 'halloweenFortune.dateKey': { $ne: dateKey } },
    { $set: { halloweenFortune: fortune } },
    { new: true, projection: { coin: 1 } },
  );
  if (!locked) {
    return readTodayFortune(userId);
  }
  if (!coins) {
    return toResult(fortune, locked.coin, false);
  }

  try {
    const coinChange = await coinLedgerService.applyCoinChange({
      userId,
      delta: coins,
      reason: 'halloween_fortune',
      sourceType: 'halloween_fortune',
      sourceId: dateKey,
      note: `Kẹo Tiên Tri: quẻ ${name}`,
      metadata: { tier, dateKey, charmed },
    });
    return toResult(fortune, coinChange.balanceAfter, false);
  } catch (error) {
    await User.updateOne(
      { _id: userId, 'halloweenFortune.dateKey': dateKey },
      previous ? { $set: { halloweenFortune: previous } } : { $unset: { halloweenFortune: 1 } },
    );
    throw error;
  }
};

module.exports = {
  FORTUNE_TIERS,
  pickFortuneTier,
  drawHalloweenFortune,
};
