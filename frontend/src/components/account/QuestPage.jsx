import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import QuestCard from "./QuestCard";
import questService from "../../services/quest.service";
import { BarSpinner } from "../common/LoadingState";
import { getClaimAllAvailability } from "./questPage.helpers";

const PERIOD_LABELS = {
  daily: "Nhiệm vụ ngày",
  weekly: "Nhiệm vụ tuần",
};

const PERIOD_ICONS = {
  daily: "fa-calendar-day",
  weekly: "fa-calendar-week",
};

const showToast = (message, type = "success") => {
  const id = `quest-toast-${Date.now()}`;
  const el = document.createElement("div");
  el.id = id;
  el.className = `fixed top-[calc(var(--app-header-total-height)+0.75rem)] right-4 z-[99999] px-5 py-3 rounded-xl text-sm font-medium shadow-xl transition-all duration-300 ${
    type === "success"
      ? "bg-green-600 text-white"
      : type === "error"
        ? "bg-red-600 text-white"
        : "bg-account-bg-secondary text-account-text-primary border border-account-border"
  }`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 300);
  }, 3000);
};

const QuestPage = ({ onCoinUpdate }) => {
  const navigate = useNavigate();
  const [quests, setQuests] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState("daily");
  const [claimingQuestId, setClaimingQuestId] = useState(null);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [claimingAll, setClaimingAll] = useState(false);

  const fetchQuests = useCallback(async () => {
    try {
      const res = await questService.getQuests();
      if (res?.data) {
        setQuests(res.data);
        return res.data;
      }
    } catch (err) {
      console.error("[QuestPage] Failed to load quests:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  const handleClaim = async (questId) => {
    setClaimingQuestId(questId);

    try {
      const res = await questService.claimReward(questId);
      if (res?.alreadyClaimed) {
        showToast("Bạn đã nhận thưởng này rồi!", "info");
      } else if (res?.coinsAwarded) {
        showToast(`+${res.coinsAwarded} coin!`, "success");
        if (onCoinUpdate && res.newBalance != null) {
          onCoinUpdate(res.newBalance);
        }
      }

      await fetchQuests();
    } catch (err) {
      showToast(err?.message || "Không thể nhận thưởng. Vui lòng thử lại.", "error");
    } finally {
      setClaimingQuestId(null);
    }
  };

  const handleClaimBonus = async (type) => {
    setClaimingBonus(true);

    try {
      const res = await questService.claimBonus(type);
      if (res?.alreadyClaimed) {
        showToast("Bạn đã nhận bonus hoàn thành rồi!", "info");
      } else if (res?.coinsAwarded) {
        showToast(`Hoàn thành tất cả! +${res.coinsAwarded} coin!`, "success");
        if (onCoinUpdate && res.newBalance != null) {
          onCoinUpdate(res.newBalance);
        }
      }

      await fetchQuests();
    } catch (err) {
      showToast(err?.message || "Không thể nhận thưởng. Vui lòng thử lại.", "error");
    } finally {
      setClaimingBonus(false);
    }
  };

  const handleClaimAll = async () => {
    const currentGroup = quests?.[activePeriod];
    const currentAvailability = getClaimAllAvailability(currentGroup);

    if (!currentAvailability.hasAnyClaimableReward) {
      showToast("Hiện tại không có thưởng nào có thể nhận.", "info");
      return;
    }

    setClaimingAll(true);

    let totalCoinsAwarded = 0;
    let latestBalance = null;
    let claimedRewardCount = 0;

    try {
      for (const questId of currentAvailability.claimableQuestIds) {
        const res = await questService.claimReward(questId);
        if (res?.coinsAwarded) {
          totalCoinsAwarded += res.coinsAwarded;
          latestBalance = res.newBalance ?? latestBalance;
          claimedRewardCount += 1;
        }
      }

      let refreshedData = quests;
      if (currentAvailability.claimableQuestIds.length > 0) {
        refreshedData = await fetchQuests();
      }

      const refreshedGroup = refreshedData?.[activePeriod];
      const refreshedAvailability = getClaimAllAvailability(refreshedGroup);

      if (refreshedAvailability.canClaimBonus) {
        const bonusRes = await questService.claimBonus(activePeriod);
        if (bonusRes?.coinsAwarded) {
          totalCoinsAwarded += bonusRes.coinsAwarded;
          latestBalance = bonusRes.newBalance ?? latestBalance;
          claimedRewardCount += 1;
        }
      }

      await fetchQuests();

      if (onCoinUpdate && latestBalance != null) {
        onCoinUpdate(latestBalance);
      }

      if (totalCoinsAwarded > 0) {
        showToast(`Đã nhận tất cả! +${totalCoinsAwarded} coin`, "success");
      } else if (claimedRewardCount > 0) {
        showToast("Đã cập nhật tất cả phần thưởng có thể nhận.", "success");
      } else {
        showToast("Không có thưởng nào mới để nhận.", "info");
      }
    } catch (err) {
      await fetchQuests();
      showToast(err?.message || "Không thể nhận tất cả thưởng. Vui lòng thử lại.", "error");
    } finally {
      setClaimingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <BarSpinner />
      </div>
    );
  }

  const group = quests?.[activePeriod];
  if (!group) return null;

  const {
    quests: questList,
    allCompleted,
    completionBonusCoins,
    completionBonusClaimed,
    canClaimCompletionBonus,
  } = group;
  const { claimableQuestIds, hasAnyClaimableReward } = getClaimAllAvailability(group);

  const claimedCoins = questList
    ? questList
        .filter((quest) => quest.isClaimed)
        .reduce((sum, quest) => sum + quest.rewardCoins, 0)
    : 0;
  const totalEarnedCoins = claimedCoins + (completionBonusClaimed ? completionBonusCoins : 0);

  const rewardStatusText = completionBonusClaimed
    ? completionBonusCoins > 0
      ? `Đã nhận bonus +${completionBonusCoins} coin!`
      : "Tất cả thưởng đã nhận!"
    : canClaimCompletionBonus
      ? `Nhận thêm +${completionBonusCoins} coin bonus hoàn thành`
      : allCompleted && completionBonusCoins > 0
        ? `Nhận hết thưởng từng nhiệm vụ để mở khóa +${completionBonusCoins} coin bonus`
        : allCompleted
          ? "Tất cả thưởng nhiệm vụ đã sẵn sàng hoặc đã nhận"
          : "Hoàn thành nhiệm vụ để nhận coin";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-account-bg-secondary border border-account-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className="fas fa-calendar-day text-primaryColor" />
            <span className="text-sm font-semibold text-account-text-primary">
              Nhiệm vụ hôm nay
            </span>
          </div>
          <div className="text-2xl font-bold text-primaryColor">
            {quests?.daily?.completed ?? 0}
            <span className="text-account-text-secondary text-base font-normal">
              /{quests?.daily?.total ?? 0}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-account-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-primaryColor rounded-full transition-all duration-500"
              style={{
                width: `${quests?.daily?.total ? Math.round((quests.daily.completed / quests.daily.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-account-text-secondary mt-2">
            {quests?.daily?.completed === quests?.daily?.total
              ? "Đã hoàn thành!"
              : "Còn nhiệm vụ chưa xong"}
          </p>
        </div>

        <div className="bg-account-bg-secondary border border-account-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className="fas fa-calendar-week text-primaryColor" />
            <span className="text-sm font-semibold text-account-text-primary">
              Nhiệm vụ tuần này
            </span>
          </div>
          <div className="text-2xl font-bold text-primaryColor">
            {quests?.weekly?.completed ?? 0}
            <span className="text-account-text-secondary text-base font-normal">
              /{quests?.weekly?.total ?? 0}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-account-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-primaryColor rounded-full transition-all duration-500"
              style={{
                width: `${quests?.weekly?.total ? Math.round((quests.weekly.completed / quests.weekly.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-account-text-secondary mt-2">
            {quests?.weekly?.completed === quests?.weekly?.total
              ? "Đã hoàn thành!"
              : "Còn nhiệm vụ chưa xong"}
          </p>
        </div>

        <div className="bg-account-bg-secondary border border-primaryColor/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className="fas fa-coins text-primaryColor" />
            <span className="text-sm font-semibold text-account-text-primary">Đã nhận được</span>
          </div>
          <div className="text-2xl font-bold text-primaryColor">
            <i className="fas fa-coins mr-1.5 text-sm" />
            {totalEarnedCoins.toLocaleString("vi-VN")}
          </div>
          <p className="text-xs text-account-text-secondary mt-2">{rewardStatusText}</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className="fas fa-trophy text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">
              Tổng nhiệm vụ đã hoàn thành
            </span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">
            <i className="fas fa-check-circle mr-1.5 text-sm" />
            {quests?.lifetime?.totalCompleted ?? 0}
          </div>
          <p className="text-xs text-yellow-400/70 mt-2">
            +{quests?.lifetime?.claimedCoins?.toLocaleString("vi-VN") ?? 0} coin đã nhận
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 md:gap-3 border-b border-account-border pb-2">
        <div className="flex gap-2">
          {["daily", "weekly"].map((type) => {
            const currentGroup = quests?.[type];
            const done = currentGroup?.completed ?? 0;
            const total = currentGroup?.total ?? 0;

            return (
              <button
                key={type}
                onClick={() => setActivePeriod(type)}
                className={`
                flex items-center gap-2 px-2 md:px-4 py-3 text-sm font-semibold border-b-2 transition-all
                ${
                  activePeriod === type
                    ? "border-primaryColor text-primaryColor"
                    : "border-transparent text-account-text-secondary hover:text-account-text-primary"
                }
              `}
              >
                <i className={`fas ${PERIOD_ICONS[type]}`} />
                {PERIOD_LABELS[type]}
                <span
                  className={`
                  inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold
                  ${done === total && total > 0 ? "bg-green-500 text-white" : "bg-primaryColor/20 text-primaryColor"}
                `}
                >
                  {done}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={handleClaimAll}
          disabled={
            claimingAll || claimingBonus || claimingQuestId != null || !hasAnyClaimableReward
          }
          className="flex-shrink-0 inline-flex items-center gap-2 px-2 sm:px-4 py-2 rounded-lg bg-primaryColor text-black text-sm font-semibold hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <i className="fas fa-coins" />
          {claimingAll
            ? "Đang nhận..."
            : claimableQuestIds.length > 0
              ? `Nhận tất cả (${claimableQuestIds.length})`
              : "Nhận tất cả"}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {questList && questList.length > 0 ? (
          questList.map((quest) => (
            <QuestCard
              key={quest.questId}
              quest={quest}
              onClaim={() => handleClaim(quest.questId)}
              onGoNow={() => navigate("/")}
              isClaiming={claimingAll || claimingQuestId === quest.questId}
            />
          ))
        ) : (
          <div className="text-center py-10 text-account-text-secondary">
            <i className="fas fa-trophy text-4xl mb-3 block opacity-30" />
            <p>Không có nhiệm vụ nào.</p>
          </div>
        )}
      </div>

      {canClaimCompletionBonus && (
        <div
          className="rounded-xl p-5 flex items-center justify-between gap-4"
          style={{
            background: "linear-gradient(135deg, rgb(var(--ui-loading)/0.15), rgb(var(--ui-loading)/0.05))",
            border: "1px solid rgb(var(--ui-loading)/0.4)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primaryColor/20 flex items-center justify-center">
              <i className="fas fa-gift text-primaryColor text-lg" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primaryColor">
                Hoàn thành tất cả nhiệm vụ {activePeriod === "daily" ? "ngày" : "tuần"}!
              </p>
              <p className="text-xs text-account-text-secondary mt-0.5">
                Nhận ngay {completionBonusCoins} coin thưởng thêm
              </p>
            </div>
          </div>
          <button
            onClick={() => handleClaimBonus(activePeriod)}
            disabled={claimingBonus || claimingAll || claimingQuestId != null}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primaryColor text-black text-sm font-semibold hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <i className="fas fa-coins" />
            {claimingBonus ? "Đang nhận..." : `+${completionBonusCoins} coin`}
          </button>
        </div>
      )}
    </div>
  );
};

export default QuestPage;
