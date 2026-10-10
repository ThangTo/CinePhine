const User = require('../models/user.model');
const CoinLedger = require('../models/coin_ledger.model');

function createCoinLedgerError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePagination(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function applyCoinChange({
  userId,
  delta,
  reason,
  sourceType = null,
  sourceId = null,
  note = '',
  metadata = null,
  createdAt = new Date(),
}) {
  const normalizedDelta = Number(delta);
  if (!userId) {
    throw createCoinLedgerError('User ID is required', 400);
  }
  if (!reason) {
    throw createCoinLedgerError('Coin change reason is required', 400);
  }
  if (!Number.isFinite(normalizedDelta) || !Number.isInteger(normalizedDelta) || normalizedDelta === 0) {
    throw createCoinLedgerError('Coin change delta must be a non-zero integer', 400);
  }

  const query = { _id: userId };
  if (normalizedDelta < 0) {
    query.coin = { $gte: Math.abs(normalizedDelta) };
  }

  const user = await User.findOneAndUpdate(
    query,
    { $inc: { coin: normalizedDelta } },
    { new: true },
  );

  if (!user) {
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      throw createCoinLedgerError('User not found', 404);
    }

    throw createCoinLedgerError('Khong du coin de thuc hien giao dich', 400);
  }

  const balanceAfter = Number(user.coin || 0);
  const balanceBefore = balanceAfter - normalizedDelta;

  const entry = await CoinLedger.create({
    userId,
    delta: normalizedDelta,
    balanceBefore,
    balanceAfter,
    reason,
    sourceType,
    sourceId: sourceId == null ? null : String(sourceId),
    note,
    metadata,
    createdAt,
  });

  return {
    user,
    entry,
    balanceBefore,
    balanceAfter,
  };
}

async function getCoinHistory(userId, { page = 1, limit = 20 } = {}) {
  if (!userId) {
    throw createCoinLedgerError('User ID is required', 400);
  }

  const normalizedPage = normalizePagination(page, 1);
  const normalizedLimit = Math.min(normalizePagination(limit, 20), 100);
  const query = { userId };

  const [entries, total] = await Promise.all([
    CoinLedger.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((normalizedPage - 1) * normalizedLimit)
      .limit(normalizedLimit),
    CoinLedger.countDocuments(query),
  ]);

  return {
    entries,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages: total > 0 ? Math.ceil(total / normalizedLimit) : 1,
  };
}

module.exports = {
  applyCoinChange,
  getCoinHistory,
};
