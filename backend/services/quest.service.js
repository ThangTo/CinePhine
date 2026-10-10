const crypto = require('crypto');
const moment = require('moment-timezone');
const QuestDefinition = require('../models/quest_definition.model');
const QuestProgress = require('../models/quest_progress.model');
const QuestConfig = require('../models/quest_config.model');
const QuestPeriodSnapshot = require('../models/quest_period_snapshot.model');
const notificationService = require('./notification.service');
const coinLedgerService = require('./coinLedger.service');
const {
  QUEST_TYPES,
  QUEST_TARGET_METRICS,
  QUEST_TIMEZONE,
  QUEST_SELECTION_MODES,
} = require('../constants/quest.constants');

const COUNT_METRICS = new Set([
  'comment_count',
  'rating_count',
  'unique_movies',
  'favorite_count',
  'watchlist_count',
]);

function createQuestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getModifiedCount(result) {
  if (!result) return 0;
  if (typeof result.modifiedCount === 'number') return result.modifiedCount;
  if (typeof result.nModified === 'number') return result.nModified;
  if (typeof result.n === 'number') return result.n;
  return 0;
}

function asIdString(value) {
  if (!value) return '';
  return String(value);
}

function uniqueIdList(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const id = asIdString(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

function isValidCoinAmount(value, { allowZero = false } = {}) {
  const min = allowZero ? 0 : 10;
  return Number.isInteger(value) && value >= min && value <= 500 && value % 10 === 0;
}

function slugifyQuestId(value = '') {
  const slug = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || `quest_${Date.now()}`;
}

function getQuestMoment(date = new Date()) {
  return moment(date).tz(QUEST_TIMEZONE);
}

function getDayStart(date = new Date()) {
  return getQuestMoment(date).startOf('day').toDate();
}

function getWeekStart(date = new Date()) {
  return getQuestMoment(date).startOf('isoWeek').toDate();
}

function getPeriodKey(type, date = new Date()) {
  const questMoment = getQuestMoment(date);

  if (type === 'daily') {
    return questMoment.format('YYYY-MM-DD');
  }

  return questMoment.startOf('isoWeek').format('GGGG-[W]WW');
}

function getPreviousPeriodKey(type, date = new Date()) {
  const questMoment = getQuestMoment(date);
  const previous = type === 'daily' ? questMoment.subtract(1, 'day') : questMoment.subtract(1, 'week');
  return getPeriodKey(type, previous.toDate());
}

function getNextPeriodKey(type, date = new Date()) {
  const questMoment = getQuestMoment(date);
  const next = type === 'daily' ? questMoment.add(1, 'day') : questMoment.add(1, 'week');
  return getPeriodKey(type, next.toDate());
}

function getMetricEventMap() {
  return {
    comment: ['comment_count'],
    rating: ['rating_count'],
    favorite: ['favorite_count'],
    watchlist: ['watchlist_count'],
    watch: ['watch_seconds', 'unique_movies'],
  };
}

function seededOrderValue(seed, value) {
  return crypto.createHash('sha256').update(`${seed}:${value}`).digest('hex');
}

function deterministicPick(definitions, count, seed) {
  return [...definitions]
    .sort((a, b) => {
      const aScore = seededOrderValue(seed, asIdString(a._id));
      const bScore = seededOrderValue(seed, asIdString(b._id));
      return aScore.localeCompare(bScore);
    })
    .slice(0, count);
}

function buildSnapshotQuest(definition, order) {
  return {
    sourceQuestDefinitionId: definition._id,
    questId: definition.questId,
    title: definition.title,
    description: definition.description || '',
    icon: definition.icon || 'fa-solid fa-star',
    category: definition.category,
    targetMetric: definition.targetMetric,
    targetValue: definition.targetValue,
    targetMovieFilter: definition.targetMovieFilter || 'any',
    rewardCoins: definition.rewardCoins,
    order,
  };
}

function buildSnapshotQuestMap(snapshot) {
  const map = new Map();

  for (const quest of snapshot?.quests || []) {
    map.set(asIdString(quest.sourceQuestDefinitionId), quest);
  }

  return map;
}

function getCompletionBonusClaimed(progressDocs = []) {
  return progressDocs.some((progress) => Boolean(progress?.isCompletionBonusClaimed));
}

function toDisplayTargetValue(targetMetric, targetValue) {
  if (targetMetric === 'watch_seconds') {
    return Math.max(1, Math.round(Number(targetValue || 0) / 60));
  }

  return Number(targetValue || 0);
}

function normalizeTemplatePayload(payload = {}, existingDoc = null) {
  const type = existingDoc?.type || payload.type;
  const category = payload.category;
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  const icon = String(payload.icon || '').trim() || 'fa-solid fa-star';
  const targetMetric = payload.targetMetric;
  const rawTargetValue = Number(payload.targetValue);
  const rewardCoins = Number(payload.rewardCoins);

  if (!QUEST_TYPES.includes(type)) {
    throw createQuestError('Loai nhiem vu khong hop le', 400);
  }

  if (!title) {
    throw createQuestError('Tieu de nhiem vu la bat buoc', 400);
  }

  if (!QUEST_TARGET_METRICS.includes(targetMetric)) {
    throw createQuestError('Target metric khong hop le', 400);
  }

  if (!['engagement', 'watch', 'social'].includes(category)) {
    throw createQuestError('Danh muc nhiem vu khong hop le', 400);
  }

  if (!Number.isFinite(rawTargetValue) || rawTargetValue <= 0) {
    throw createQuestError('Muc tieu nhiem vu phai lon hon 0', 400);
  }

  if (!Number.isInteger(rawTargetValue)) {
    throw createQuestError('Target value phai la so nguyen duong', 400);
  }

  if (!isValidCoinAmount(rewardCoins)) {
    throw createQuestError('rewardCoins phai la boi so cua 10, trong khoang 10-500', 400);
  }

  const normalizedTargetValue =
    targetMetric === 'watch_seconds'
      ? Math.round(rawTargetValue * 60)
      : Math.round(rawTargetValue);

  if (!Number.isInteger(normalizedTargetValue) || normalizedTargetValue <= 0) {
    throw createQuestError('Target value khong hop le', 400);
  }

  return {
    type,
    category,
    title,
    description,
    icon,
    targetMetric,
    targetValue: normalizedTargetValue,
    targetMovieFilter: 'any',
    rewardCoins,
  };
}

function toPublicQuestTemplate(definition) {
  if (!definition) return null;

  return {
    id: asIdString(definition._id),
    questId: definition.questId,
    type: definition.type,
    category: definition.category,
    title: definition.title,
    description: definition.description || '',
    icon: definition.icon || 'fa-solid fa-star',
    targetMetric: definition.targetMetric,
    targetValue: definition.targetValue,
    targetInputValue: toDisplayTargetValue(definition.targetMetric, definition.targetValue),
    rewardCoins: definition.rewardCoins,
    order: definition.order || 0,
    isActive: Boolean(definition.isActive),
    createdAt: definition.createdAt || null,
    updatedAt: definition.updatedAt || null,
  };
}

function toPublicQuestConfig(config) {
  if (!config) return null;

  return {
    type: config.type,
    selectionMode: config.selectionMode,
    fixedQuestIds: (config.fixedQuestIds || []).map(asIdString),
    randomPoolQuestIds: (config.randomPoolQuestIds || []).map(asIdString),
    randomCount: Number(config.randomCount || 0),
    completionBonusCoins: Number(config.completionBonusCoins || 0),
    updatedAt: config.updatedAt || null,
    updatedBy: config.updatedBy ? asIdString(config.updatedBy) : null,
  };
}

function toPublicSnapshot(snapshot) {
  if (!snapshot) return null;

  return {
    type: snapshot.type,
    periodKey: snapshot.periodKey,
    timezone: snapshot.timezone || QUEST_TIMEZONE,
    selectionMode: snapshot.selectionMode,
    completionBonusCoins: Number(snapshot.completionBonusCoins || 0),
    configUpdatedAt: snapshot.configUpdatedAt || null,
    quests: (snapshot.quests || []).map((quest) => ({
      sourceQuestDefinitionId: asIdString(quest.sourceQuestDefinitionId),
      questId: quest.questId,
      title: quest.title,
      description: quest.description || '',
      icon: quest.icon || 'fa-solid fa-star',
      category: quest.category,
      targetMetric: quest.targetMetric,
      targetValue: quest.targetValue,
      targetInputValue: toDisplayTargetValue(quest.targetMetric, quest.targetValue),
      rewardCoins: quest.rewardCoins,
      order: quest.order || 0,
    })),
  };
}

async function syncQuestDefinitions() {
  const definitions = await QuestDefinition.find({ isActive: true }).sort({ type: 1, order: 1 });
  const daily = definitions.filter((definition) => definition.type === 'daily');
  const weekly = definitions.filter((definition) => definition.type === 'weekly');
  return { daily, weekly, all: definitions };
}

async function ensureQuestConfigsSeeded() {
  const activeDefinitions = await QuestDefinition.find({ isActive: true }).sort({ type: 1, order: 1 });
  const existingConfigs = await QuestConfig.find({});
  const existingMap = new Map(existingConfigs.map((config) => [config.type, config]));

  for (const type of QUEST_TYPES) {
    if (existingMap.has(type)) continue;

    const typeDefinitions = activeDefinitions.filter((definition) => definition.type === type);
    const fixedQuestIds = typeDefinitions.map((definition) => definition._id);
    const completionBonusCoins = typeDefinitions[0]?.completionBonusCoins || 0;

    const created = await QuestConfig.create({
      type,
      selectionMode: 'fixed',
      fixedQuestIds,
      randomPoolQuestIds: fixedQuestIds,
      randomCount: fixedQuestIds.length,
      completionBonusCoins,
      updatedBy: null,
    });

    existingMap.set(type, created);
  }

  return existingMap;
}

async function getQuestConfigMap() {
  const existingMap = await ensureQuestConfigsSeeded();
  const configs = existingMap.size === QUEST_TYPES.length ? [...existingMap.values()] : await QuestConfig.find({});
  return new Map(configs.map((config) => [config.type, config]));
}

async function getQuestConfigByType(type) {
  if (!QUEST_TYPES.includes(type)) {
    throw createQuestError('Loai nhiem vu khong hop le', 400);
  }

  const configMap = await getQuestConfigMap();
  const config = configMap.get(type);
  if (!config) {
    throw createQuestError('Khong tim thay cau hinh nhiem vu', 404);
  }
  return config;
}

async function getActiveDefinitionsByIds(type, ids = []) {
  const uniqueIds = uniqueIdList(ids);

  if (!uniqueIds.length) {
    return [];
  }

  const definitions = await QuestDefinition.find({
    _id: { $in: uniqueIds },
    type,
    isActive: true,
  }).sort({ order: 1, createdAt: 1 });

  const definitionsById = new Map(definitions.map((definition) => [asIdString(definition._id), definition]));
  return uniqueIds.map((id) => definitionsById.get(id)).filter(Boolean);
}

async function buildQuestSelectionFromConfig(config, periodKey) {
  const selectionMode = config?.selectionMode || 'fixed';
  let selectedDefinitions = [];

  if (selectionMode === 'random') {
    const poolDefinitions = await getActiveDefinitionsByIds(config.type, config.randomPoolQuestIds || []);
    const uniquePool = uniqueIdList(poolDefinitions.map((definition) => definition._id));
    const randomCount = Math.min(Number(config.randomCount || 0), uniquePool.length);

    if (!poolDefinitions.length || randomCount <= 0) {
      return [];
    }

    const seed = `${config.type}:${periodKey}:${config.updatedAt ? new Date(config.updatedAt).toISOString() : 'draft'}`;
    selectedDefinitions = deterministicPick(poolDefinitions, randomCount, seed);
  } else {
    selectedDefinitions = await getActiveDefinitionsByIds(config.type, config.fixedQuestIds || []);
  }

  return selectedDefinitions.map((definition, index) => buildSnapshotQuest(definition, index + 1));
}

async function ensureQuestPeriodSnapshot(type, periodKey, options = {}) {
  let snapshot = await QuestPeriodSnapshot.findOne({ type, periodKey });
  if (snapshot) {
    return snapshot;
  }

  const config = options.config || (await getQuestConfigByType(type));
  const quests = await buildQuestSelectionFromConfig(config, periodKey);

  try {
    snapshot = await QuestPeriodSnapshot.findOneAndUpdate(
      { type, periodKey },
      {
        $setOnInsert: {
          type,
          periodKey,
          timezone: QUEST_TIMEZONE,
          selectionMode: config.selectionMode,
          completionBonusCoins: Number(config.completionBonusCoins || 0),
          quests,
          configUpdatedAt: config.updatedAt || null,
        },
      },
      {
        upsert: true,
        new: true,
      },
    );
  } catch (error) {
    if (error?.code === 11000) {
      snapshot = await QuestPeriodSnapshot.findOne({ type, periodKey });
    } else {
      throw error;
    }
  }

  return snapshot;
}

async function getQuestSnapshotForUser(type, date = new Date()) {
  const periodKey = getPeriodKey(type, date);
  const snapshot = await ensureQuestPeriodSnapshot(type, periodKey, { date });
  return { periodKey, snapshot };
}

async function ensureCurrentPeriodSnapshotLocked(type, date = new Date()) {
  const periodKey = getPeriodKey(type, date);
  return ensureQuestPeriodSnapshot(type, periodKey, { date });
}

function buildQuestGroup(snapshot, progressDocs = []) {
  const progressMap = new Map(
    progressDocs.map((progress) => [asIdString(progress.questId), progress]),
  );

  const quests = (snapshot?.quests || []).map((quest) => {
    const progress = progressMap.get(asIdString(quest.sourceQuestDefinitionId));

    return {
      questId: asIdString(quest.sourceQuestDefinitionId),
      questIdString: quest.questId,
      title: quest.title,
      description: quest.description || '',
      icon: quest.icon,
      category: quest.category,
      targetMetric: quest.targetMetric,
      targetValue: quest.targetValue,
      currentValue: progress ? progress.currentValue : 0,
      watchedMovieIds: progress ? progress.watchedMovieIds : [],
      isCompleted: progress ? progress.isCompleted : false,
      isClaimed: progress ? progress.isClaimed : false,
      rewardCoins: quest.rewardCoins,
      canClaim: progress ? progress.isCompleted && !progress.isClaimed : false,
    };
  });

  const total = quests.length;
  const completed = quests.filter((quest) => quest.isCompleted).length;
  const claimed = quests.filter((quest) => quest.isClaimed).length;
  const completionBonusCoins = Number(snapshot?.completionBonusCoins || 0);
  const completionBonusClaimed = getCompletionBonusClaimed(progressDocs);

  return {
    periodKey: snapshot?.periodKey || '',
    quests,
    total,
    completed,
    claimed,
    allCompleted: total > 0 && completed === total,
    allClaimed: total > 0 && claimed === total,
    completionBonusCoins,
    completionBonusClaimed,
    canClaimCompletionBonus:
      total > 0 &&
      completed === total &&
      claimed === total &&
      completionBonusCoins > 0 &&
      !completionBonusClaimed,
  };
}

async function buildQuestGroupForUser(userId, snapshot) {
  if (!snapshot?.quests?.length) {
    return buildQuestGroup(snapshot || { periodKey: '', quests: [], completionBonusCoins: 0 }, []);
  }

  const progressDocs = await QuestProgress.find({
    userId,
    questId: { $in: snapshot.quests.map((quest) => quest.sourceQuestDefinitionId) },
    periodKey: snapshot.periodKey,
  });

  return buildQuestGroup(snapshot, progressDocs);
}

async function getUserQuestProgress(userId) {
  const now = new Date();
  const [{ snapshot: dailySnapshot }, { snapshot: weeklySnapshot }] = await Promise.all([
    getQuestSnapshotForUser('daily', now),
    getQuestSnapshotForUser('weekly', now),
  ]);

  const [dailyGroup, weeklyGroup, lifetime] = await Promise.all([
    buildQuestGroupForUser(userId, dailySnapshot),
    buildQuestGroupForUser(userId, weeklySnapshot),
    getLifetimeQuestStats(userId),
  ]);

  return {
    daily: dailyGroup,
    weekly: weeklyGroup,
    lifetime,
  };
}

async function getLifetimeQuestStats(userId) {
  const claimedProgress = await QuestProgress.find({
    userId,
    isClaimed: true,
  });

  if (!claimedProgress.length) {
    return { totalCompleted: 0, claimedCoins: 0 };
  }

  const definitionIds = claimedProgress.map((p) => p.questId);
  const definitions = await QuestDefinition.find({ _id: { $in: definitionIds } });
  const definitionMap = new Map(
    definitions.map((d) => [asIdString(d._id), d.rewardCoins])
  );

  let totalCompleted = 0;
  let claimedCoins = 0;
  let completionBonusClaimed = 0;

  for (const progress of claimedProgress) {
    const defId = asIdString(progress.questId);
    if (progress.isClaimed) {
      totalCompleted++;
      claimedCoins += definitionMap.get(defId) || 0;
    }
    if (progress.isCompletionBonusClaimed) {
      completionBonusClaimed++;
    }
  }

  claimedCoins += completionBonusClaimed * 50;

  return { totalCompleted, claimedCoins };
}

async function getQuestSummary(userId) {
  const progress = await getUserQuestProgress(userId);
  const lifetime = await getLifetimeQuestStats(userId);

  function sumCoins(quests, claimedOnly) {
    return quests
      .filter((quest) => !claimedOnly || quest.isClaimed)
      .reduce((sum, quest) => sum + quest.rewardCoins, 0);
  }

  return {
    daily: {
      total: progress.daily.total,
      completed: progress.daily.completed,
      claimed: progress.daily.claimed,
      claimedCoins: sumCoins(progress.daily.quests, true),
      completionBonusCoins: progress.daily.completionBonusCoins,
      completionBonusClaimed: progress.daily.completionBonusClaimed,
      canClaimCompletionBonus: progress.daily.canClaimCompletionBonus,
    },
    weekly: {
      total: progress.weekly.total,
      completed: progress.weekly.completed,
      claimed: progress.weekly.claimed,
      claimedCoins: sumCoins(progress.weekly.quests, true),
      completionBonusCoins: progress.weekly.completionBonusCoins,
      completionBonusClaimed: progress.weekly.completionBonusClaimed,
      canClaimCompletionBonus: progress.weekly.canClaimCompletionBonus,
    },
    lifetime,
  };
}

async function checkAndUpdateProgress(userId, event) {
  const metricMap = getMetricEventMap();
  const relevantMetrics = metricMap[event.type] || [];
  if (!relevantMetrics.length) return [];

  const now = new Date();
  const [{ snapshot: dailySnapshot }, { snapshot: weeklySnapshot }] = await Promise.all([
    getQuestSnapshotForUser('daily', now),
    getQuestSnapshotForUser('weekly', now),
  ]);

  const snapshots = [dailySnapshot, weeklySnapshot];
  const relevantSnapshotQuests = snapshots.flatMap((snapshot) =>
    (snapshot?.quests || [])
      .filter((quest) => relevantMetrics.includes(quest.targetMetric))
      .map((quest) => ({ snapshot, quest })),
  );

  if (!relevantSnapshotQuests.length) return [];

  const results = [];

  for (const { snapshot, quest } of relevantSnapshotQuests) {
    const questId = quest.sourceQuestDefinitionId;
    let progress = await QuestProgress.findOne({
      userId,
      questId,
      periodKey: snapshot.periodKey,
    });

    if (!progress) {
      progress = new QuestProgress({
        userId,
        questId,
        periodKey: snapshot.periodKey,
        currentValue: 0,
      });
    }

    if (progress.isCompleted) {
      results.push({ questId, isJustCompleted: false, quest, snapshot });
      continue;
    }

    let isJustCompleted = false;

    if (quest.targetMetric === 'unique_movies' && event.movieId) {
      const alreadyTracked = (progress.watchedMovieIds || []).some(
        (id) => asIdString(id) === asIdString(event.movieId),
      );

      if (!alreadyTracked) {
        progress.watchedMovieIds.push(event.movieId);
        progress.currentValue = progress.watchedMovieIds.length;
      }
    } else if (quest.targetMetric === 'watch_seconds' && event.seconds) {
      progress.currentValue = (progress.currentValue || 0) + Number(event.seconds || 0);
    } else if (COUNT_METRICS.has(quest.targetMetric)) {
      progress.currentValue = (progress.currentValue || 0) + 1;
    }

    progress.lastUpdatedAt = now;

    if (progress.currentValue >= quest.targetValue && !progress.isCompleted) {
      progress.isCompleted = true;
      isJustCompleted = true;
    }

    await progress.save();
    results.push({ questId, isJustCompleted, quest, snapshot, prog: progress });
  }

  return results;
}

async function sendUserNotification(userId, payload) {
  if (typeof notificationService.create === 'function') {
    return notificationService.create(userId, payload);
  }

  if (typeof notificationService.createNotification === 'function') {
    return notificationService.createNotification({ userId, ...payload });
  }

  return null;
}

async function awardQuestCoins({
  userId,
  amount,
  reason,
  sourceType,
  sourceId,
  note,
  metadata,
  claimedAt,
}) {
  try {
    return await coinLedgerService.applyCoinChange({
      userId,
      delta: amount,
      reason,
      sourceType,
      sourceId,
      note,
      metadata,
      createdAt: claimedAt,
    });
  } catch (error) {
    throw createQuestError(error.message, error.statusCode || 500);
  }
}

async function getSnapshotQuestForClaim(questId, options = {}) {
  const definition = options.definition || (await QuestDefinition.findById(questId));
  if (!definition) {
    throw createQuestError('Quest not found', 404);
  }

  const now = options.now || new Date();
  const type = options.type || definition.type;
  const periodKey = options.periodKey || getPeriodKey(type, now);
  const snapshot =
    options.snapshot || (await ensureQuestPeriodSnapshot(type, periodKey, { date: now }));
  const snapshotQuest =
    options.snapshotQuest ||
    (snapshot?.quests || []).find(
      (quest) => asIdString(quest.sourceQuestDefinitionId) === asIdString(definition._id),
    );

  if (!snapshotQuest) {
    throw createQuestError('Quest is not active for this period', 404);
  }

  return {
    definition,
    snapshot,
    snapshotQuest,
    type,
    periodKey,
  };
}

async function claimReward(userId, questId, options = {}) {
  const now = options.now || new Date();
  const { definition, snapshot, snapshotQuest, periodKey } = await getSnapshotQuestForClaim(questId, {
    ...options,
    now,
  });

  const claimedProgress = await QuestProgress.findOneAndUpdate(
    {
      userId,
      questId: definition._id,
      periodKey,
      isCompleted: true,
      isClaimed: false,
    },
    { $set: { isClaimed: true, claimedAt: now } },
    { new: true },
  );

  if (!claimedProgress) {
    const progress = await QuestProgress.findOne({ userId, questId: definition._id, periodKey });
    if (!progress) throw createQuestError('Quest progress not found', 404);
    if (!progress.isCompleted) throw createQuestError('Quest not yet completed', 400);
    if (progress.isClaimed) {
      return { alreadyClaimed: true, coinsAwarded: 0, questDef: snapshotQuest, newBalance: null };
    }

    throw createQuestError('Quest reward is being claimed. Please try again.', 409);
  }

  let coinChange;
  try {
    coinChange = await awardQuestCoins({
      userId,
      amount: snapshotQuest.rewardCoins,
      reason: options.autoClaim ? 'quest_reward_auto' : 'quest_reward',
      sourceType: 'quest_reward',
      sourceId: claimedProgress._id || `${userId}:${definition._id}:${periodKey}`,
      note: options.autoClaim
        ? `Tự động nhận thưởng nhiệm vụ: ${snapshotQuest.title}`
        : `Nhận thưởng nhiệm vụ: ${snapshotQuest.title}`,
      metadata: {
        questDefinitionId: asIdString(definition._id),
        questId: snapshotQuest.questId,
        questTitle: snapshotQuest.title,
        periodKey,
        questType: snapshot.type,
        autoClaim: Boolean(options.autoClaim),
      },
      claimedAt: now,
    });
  } catch (error) {
    await QuestProgress.updateOne(
      { userId, questId: definition._id, periodKey, isClaimed: true },
      { $set: { isClaimed: false, claimedAt: null } },
    );
    throw error;
  }

  if (!options.skipNotification) {
    try {
      await sendUserNotification(userId, {
        title: options.autoClaim ? 'He thong da tu nhan thuong nhiem vu' : 'Da nhan thuong nhiem vu',
        message: options.autoClaim
          ? `He thong da tu cong ${snapshotQuest.rewardCoins} coin cho nhiem vu "${snapshotQuest.title}" vi ky nhiem vu da ket thuc.`
          : `Ban da nhan duoc ${snapshotQuest.rewardCoins} coin tu nhiem vu "${snapshotQuest.title}"!`,
        type: 'quest_claimed',
        targetUrl: '/account?tabs=coin-history',
        data: {
          questTitle: snapshotQuest.title,
          coinsAwarded: snapshotQuest.rewardCoins,
          periodKey,
          autoClaim: Boolean(options.autoClaim),
        },
      });
    } catch (notifErr) {
      console.error('[quest] Failed to send notification:', notifErr.message);
    }
  }

  return {
    alreadyClaimed: false,
    coinsAwarded: snapshotQuest.rewardCoins,
    questDef: snapshotQuest,
    newBalance: coinChange.balanceAfter,
  };
}

function isIgnorableAutoClaimBonusError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('not all quests completed') ||
    message.includes('claim all quest rewards') ||
    message.includes('no completion bonus configured') ||
    message.includes('quest definitions not found') ||
    message.includes('completion bonus is being claimed')
  );
}

async function claimCompletionBonus(userId, type, options = {}) {
  const now = options.now || new Date();
  const periodKey = options.periodKey || getPeriodKey(type, now);
  const snapshot =
    options.snapshot || (await ensureQuestPeriodSnapshot(type, periodKey, { date: now }));

  if (!snapshot?.quests?.length) {
    throw createQuestError('Quest definitions not found', 404);
  }

  const group = await buildQuestGroupForUser(userId, snapshot);

  if (!group.allCompleted) {
    throw createQuestError('Not all quests completed', 400);
  }

  if (!group.allClaimed) {
    throw createQuestError('Please claim all quest rewards before claiming the completion bonus', 400);
  }

  if (group.completionBonusClaimed) {
    return { alreadyClaimed: true, coinsAwarded: 0, newBalance: null };
  }

  const bonus = Number(snapshot.completionBonusCoins || 0);
  if (!bonus) {
    throw createQuestError('No completion bonus configured', 400);
  }

  const questIds = snapshot.quests.map((quest) => quest.sourceQuestDefinitionId);

  const bonusClaimResult = await QuestProgress.updateMany(
    {
      userId,
      questId: { $in: questIds },
      periodKey,
      isClaimed: true,
      isCompletionBonusClaimed: { $ne: true },
    },
    { $set: { isCompletionBonusClaimed: true, completionBonusClaimedAt: now } },
  );

  if (getModifiedCount(bonusClaimResult) === 0) {
    const refreshedGroup = await buildQuestGroupForUser(userId, snapshot);

    if (refreshedGroup.completionBonusClaimed) {
      return { alreadyClaimed: true, coinsAwarded: 0, newBalance: null };
    }

    if (!refreshedGroup.allClaimed) {
      throw createQuestError('Please claim all quest rewards before claiming the completion bonus', 400);
    }

    throw createQuestError('Completion bonus is being claimed. Please try again.', 409);
  }

  let coinChange;
  try {
    coinChange = await awardQuestCoins({
      userId,
      amount: bonus,
      reason: options.autoClaim ? 'quest_bonus_auto' : 'quest_bonus',
      sourceType: 'quest_completion_bonus',
      sourceId: `${userId}:${type}:${periodKey}`,
      note: options.autoClaim
        ? `Tự động nhận bonus hoàn thành nhiệm vụ ${type === 'weekly' ? 'tuần' : 'ngày'}: ${bonus} coin`
        : `Nhận bonus hoàn thành nhiệm vụ ${type === 'weekly' ? 'tuần' : 'ngày'}: ${bonus} coin`,
      metadata: {
        questType: type,
        periodKey,
        autoClaim: Boolean(options.autoClaim),
      },
      claimedAt: now,
    });
  } catch (error) {
    await QuestProgress.updateMany(
      {
        userId,
        questId: { $in: questIds },
        periodKey,
        isCompletionBonusClaimed: true,
      },
      { $set: { isCompletionBonusClaimed: false, completionBonusClaimedAt: null } },
    );
    throw error;
  }

  if (!options.skipNotification) {
    try {
      await sendUserNotification(userId, {
        title: options.autoClaim ? 'He thong da tu nhan bonus hoan thanh' : 'Nhan thuong hoan thanh!',
        message: options.autoClaim
          ? `He thong da tu cong ${bonus} coin bonus ${type === 'daily' ? 'ngay' : 'tuan'} cho ban.`
          : `Ban da hoan thanh tat ca nhiem vu ${type === 'daily' ? 'ngay' : 'tuan'} va nhan duoc ${bonus} coin!`,
        type: 'quest_bonus',
        targetUrl: '/account?tabs=coin-history',
        data: { bonusCoins: bonus, questType: type, periodKey, autoClaim: Boolean(options.autoClaim) },
      });
    } catch (notifErr) {
      console.error('[quest] Failed to send notification:', notifErr.message);
    }
  }

  return { alreadyClaimed: false, coinsAwarded: bonus, newBalance: coinChange.balanceAfter };
}

async function autoClaimQuestPeriod(type, periodKey, options = {}) {
  const snapshot = options.snapshot || (await QuestPeriodSnapshot.findOne({ type, periodKey }));
  if (!snapshot?.quests?.length) {
    return { type, periodKey, processedUsers: 0, totalCoinsAwarded: 0, totalRewardsClaimed: 0 };
  }

  const progressDocs = await QuestProgress.find({
    periodKey,
    questId: { $in: snapshot.quests.map((quest) => quest.sourceQuestDefinitionId) },
    isCompleted: true,
  });

  const userIds = [...new Set(progressDocs.map((progress) => asIdString(progress.userId)))];
  const claimedAt = options.claimedAt || new Date();

  let processedUsers = 0;
  let totalCoinsAwarded = 0;
  let totalRewardsClaimed = 0;

  for (const userId of userIds) {
    let userCoinsAwarded = 0;
    let claimedRewards = 0;
    const autoClaimedQuestTitles = [];

    for (const quest of snapshot.quests) {
      const matchingProgress = progressDocs.find(
        (progress) =>
          asIdString(progress.userId) === userId &&
          asIdString(progress.questId) === asIdString(quest.sourceQuestDefinitionId),
      );

      if (!matchingProgress || matchingProgress.isClaimed !== false) {
        continue;
      }

      const rewardResult = await claimReward(userId, quest.sourceQuestDefinitionId, {
        periodKey,
        now: claimedAt,
        autoClaim: true,
        skipNotification: true,
        snapshot,
        snapshotQuest: quest,
        type,
      });

      if (!rewardResult.alreadyClaimed) {
        userCoinsAwarded += rewardResult.coinsAwarded;
        claimedRewards += 1;
        autoClaimedQuestTitles.push(quest.title);
      }
    }

    try {
      const bonusResult = await claimCompletionBonus(userId, type, {
        periodKey,
        now: claimedAt,
        autoClaim: true,
        skipNotification: true,
        snapshot,
      });

      if (!bonusResult.alreadyClaimed) {
        userCoinsAwarded += bonusResult.coinsAwarded;
        claimedRewards += 1;
      }
    } catch (error) {
      if (!isIgnorableAutoClaimBonusError(error)) {
        throw error;
      }
    }

    if (userCoinsAwarded <= 0) {
      continue;
    }

    processedUsers += 1;
    totalCoinsAwarded += userCoinsAwarded;
    totalRewardsClaimed += claimedRewards;

    try {
      await sendUserNotification(userId, {
        title: 'He thong da tu cong coin tu nhiem vu',
        message: `He thong da tu cong ${userCoinsAwarded} coin tu nhiem vu ${type === 'daily' ? 'ngay' : 'tuan'} ban chua kip nhan.`,
        type: 'quest_auto_claim',
        targetUrl: '/account?tabs=coin-history',
        data: {
          questType: type,
          periodKey,
          totalCoinsAwarded: userCoinsAwarded,
          claimedRewards,
          autoClaimedQuestTitles,
        },
      });
    } catch (notifErr) {
      console.error('[quest] Failed to send auto-claim notification:', notifErr.message);
    }
  }

  return {
    type,
    periodKey,
    processedUsers,
    totalCoinsAwarded,
    totalRewardsClaimed,
  };
}

async function autoClaimExpiredQuestPeriods(options = {}) {
  const now = options.now || new Date();
  const results = [];
  const questMoment = getQuestMoment(now);

  results.push(
    await autoClaimQuestPeriod('daily', getPreviousPeriodKey('daily', now), {
      claimedAt: now,
    }),
  );

  if (questMoment.isoWeekday() === 1) {
    results.push(
      await autoClaimQuestPeriod('weekly', getPreviousPeriodKey('weekly', now), {
        claimedAt: now,
      }),
    );
  }

  return results;
}

async function validateQuestConfigInput(type, payload = {}, currentConfig = null) {
  if (!QUEST_TYPES.includes(type)) {
    throw createQuestError('Loai nhiem vu khong hop le', 400);
  }

  const selectionMode = payload.selectionMode;
  if (!QUEST_SELECTION_MODES.includes(selectionMode)) {
    throw createQuestError('selectionMode phai la "fixed" hoac "random"', 400);
  }

  const completionBonusCoins = Number(payload.completionBonusCoins || 0);
  if (!isValidCoinAmount(completionBonusCoins, { allowZero: true })) {
    throw createQuestError('completionBonusCoins phai la boi so cua 10, trong khoang 0-500', 400);
  }

  const fixedQuestIds = uniqueIdList(payload.fixedQuestIds || currentConfig?.fixedQuestIds || []);
  const randomPoolQuestIds = uniqueIdList(
    payload.randomPoolQuestIds || currentConfig?.randomPoolQuestIds || [],
  );
  const activeDefinitions = await QuestDefinition.find({ type, isActive: true }).sort({ order: 1, createdAt: 1 });
  const activeDefinitionMap = new Map(activeDefinitions.map((definition) => [asIdString(definition._id), definition]));

  const normalizedFixedQuestIds = fixedQuestIds.filter((id) => activeDefinitionMap.has(id));
  const normalizedRandomPoolQuestIds = randomPoolQuestIds.filter((id) => activeDefinitionMap.has(id));

  if (selectionMode === 'fixed' && !normalizedFixedQuestIds.length) {
    throw createQuestError('Danh sach nhiem vu co dinh khong duoc de trong', 400);
  }

  if (selectionMode === 'random' && !normalizedRandomPoolQuestIds.length) {
    throw createQuestError('Pool random khong duoc de trong', 400);
  }

  let randomCount = Number(payload.randomCount ?? currentConfig?.randomCount ?? 0);
  if (!Number.isInteger(randomCount) || randomCount < 0) {
    throw createQuestError('randomCount khong hop le', 400);
  }

  if (selectionMode === 'random') {
    if (randomCount <= 0) {
      throw createQuestError('randomCount phai lon hon 0', 400);
    }
    if (randomCount > normalizedRandomPoolQuestIds.length) {
      throw createQuestError('randomCount khong duoc lon hon so quest trong pool', 400);
    }
  } else if (!randomCount) {
    randomCount = normalizedRandomPoolQuestIds.length || normalizedFixedQuestIds.length;
  }

  return {
    type,
    selectionMode,
    fixedQuestIds: normalizedFixedQuestIds,
    randomPoolQuestIds: normalizedRandomPoolQuestIds,
    randomCount,
    completionBonusCoins,
  };
}

async function getAdminQuestConfig(date = new Date()) {
  const configMap = await getQuestConfigMap();
  const activeDefinitions = await QuestDefinition.find({ isActive: true }).sort({ type: 1, order: 1, createdAt: 1 });
  const templates = {
    daily: activeDefinitions.filter((definition) => definition.type === 'daily').map(toPublicQuestTemplate),
    weekly: activeDefinitions.filter((definition) => definition.type === 'weekly').map(toPublicQuestTemplate),
  };

  const currentSnapshot = {};
  const nextPeriodKey = {};
  const nextPreview = {};
  const draftConfig = {};

  for (const type of QUEST_TYPES) {
    const config = configMap.get(type);
    const currentKey = getPeriodKey(type, date);
    const snapshot = await ensureQuestPeriodSnapshot(type, currentKey, { date, config });
    const previewKey = getNextPeriodKey(type, date);
    const previewSnapshot = {
      type,
      periodKey: previewKey,
      timezone: QUEST_TIMEZONE,
      selectionMode: config.selectionMode,
      completionBonusCoins: Number(config.completionBonusCoins || 0),
      quests: await buildQuestSelectionFromConfig(config, previewKey),
      configUpdatedAt: config.updatedAt || null,
    };

    currentSnapshot[type] = toPublicSnapshot(snapshot);
    nextPeriodKey[type] = previewKey;
    nextPreview[type] = toPublicSnapshot(previewSnapshot);
    draftConfig[type] = toPublicQuestConfig(config);
  }

  return {
    currentSnapshot,
    draftConfig,
    nextPeriodKey,
    nextPreview,
    templates,
  };
}

async function updateQuestConfig(type, payload = {}, updatedBy = null) {
  const currentConfig = await getQuestConfigByType(type);
  await ensureCurrentPeriodSnapshotLocked(type);
  const normalized = await validateQuestConfigInput(type, payload, currentConfig);

  const updatedConfig = await QuestConfig.findOneAndUpdate(
    { type },
    {
      $set: {
        selectionMode: normalized.selectionMode,
        fixedQuestIds: normalized.fixedQuestIds,
        randomPoolQuestIds: normalized.randomPoolQuestIds,
        randomCount: normalized.randomCount,
        completionBonusCoins: normalized.completionBonusCoins,
        updatedBy: updatedBy || null,
      },
    },
    { new: true },
  );

  const nextPeriodKey = getNextPeriodKey(type);
  const nextPreview = {
    type,
    periodKey: nextPeriodKey,
    timezone: QUEST_TIMEZONE,
    selectionMode: updatedConfig.selectionMode,
    completionBonusCoins: Number(updatedConfig.completionBonusCoins || 0),
    quests: await buildQuestSelectionFromConfig(updatedConfig, nextPeriodKey),
    configUpdatedAt: updatedConfig.updatedAt || null,
  };

  return {
    config: toPublicQuestConfig(updatedConfig),
    nextPeriodKey,
    nextPreview: toPublicSnapshot(nextPreview),
  };
}

async function upsertQuestTemplate(payload = {}) {
  const existingDoc = payload.id ? await QuestDefinition.findById(payload.id) : null;
  if (payload.id && !existingDoc) {
    throw createQuestError('Quest template not found', 404);
  }

  if (existingDoc && payload.type && payload.type !== existingDoc.type) {
    throw createQuestError('Khong the doi loai quest sau khi da tao', 400);
  }

  if (existingDoc) {
    await ensureCurrentPeriodSnapshotLocked(existingDoc.type);
  }

  const normalizedPayload = normalizeTemplatePayload(payload, existingDoc);

  let order = Number(payload.order);
  if (!Number.isInteger(order) || order <= 0) {
    const latestByType = await QuestDefinition.find({ type: normalizedPayload.type }).sort({ order: -1 });
    order = Number(latestByType[0]?.order || 0) + 1;
  }

  const nextQuestId =
    existingDoc?.questId ||
    payload.questId ||
    `${normalizedPayload.type}_${slugifyQuestId(normalizedPayload.title)}_${Date.now()}`;

  const update = {
    ...normalizedPayload,
    order,
    questId: nextQuestId,
    isActive: true,
  };

  let document;
  if (existingDoc) {
    Object.assign(existingDoc, update);
    document = await existingDoc.save();
  } else {
    document = await QuestDefinition.create(update);
  }

  return toPublicQuestTemplate(document);
}

async function archiveQuestTemplate(id) {
  const template = await QuestDefinition.findById(id);
  if (!template) {
    throw createQuestError('Quest template not found', 404);
  }

  await ensureCurrentPeriodSnapshotLocked(template.type);

  if (template.isActive !== false) {
    template.isActive = false;
    await template.save();
  }

  const config = await getQuestConfigByType(template.type);
  const archivedId = asIdString(template._id);
  const fixedQuestIds = uniqueIdList((config.fixedQuestIds || []).filter((value) => asIdString(value) !== archivedId));
  const randomPoolQuestIds = uniqueIdList(
    (config.randomPoolQuestIds || []).filter((value) => asIdString(value) !== archivedId),
  );
  const randomCount = Math.min(Number(config.randomCount || 0), randomPoolQuestIds.length);

  await QuestConfig.findOneAndUpdate(
    { type: template.type },
    {
      $set: {
        fixedQuestIds,
        randomPoolQuestIds,
        randomCount,
      },
    },
    { new: true },
  );

  return {
    archivedTemplateId: archivedId,
    type: template.type,
  };
}

module.exports = {
  QUEST_TIMEZONE,
  getPeriodKey,
  getPreviousPeriodKey,
  getNextPeriodKey,
  getDayStart,
  getWeekStart,
  syncQuestDefinitions,
  ensureQuestConfigsSeeded,
  ensureQuestPeriodSnapshot,
  getUserQuestProgress,
  getQuestSummary,
  checkAndUpdateProgress,
  claimReward,
  claimCompletionBonus,
  autoClaimQuestPeriod,
  autoClaimExpiredQuestPeriods,
  getAdminQuestConfig,
  updateQuestConfig,
  upsertQuestTemplate,
  archiveQuestTemplate,
};
