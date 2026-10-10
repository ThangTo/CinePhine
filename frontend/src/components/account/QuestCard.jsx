import React from "react";
import { cardStyles } from "./shared-styles";

const formatWatchTime = (seconds) => {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}p` : `${h}h`;
  }

  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m}p` : `${seconds}s`;
};

const getTargetLabel = (quest) => {
  const { targetMetric, targetValue } = quest;

  switch (targetMetric) {
    case "watch_seconds":
      return formatWatchTime(targetValue);
    case "unique_movies":
    case "comment_count":
    case "rating_count":
    case "favorite_count":
    case "watchlist_count":
      return `${targetValue} phim`;
    default:
      return targetValue;
  }
};

const getCurrentLabel = (quest) => {
  const { targetMetric, currentValue } = quest;

  switch (targetMetric) {
    case "watch_seconds":
      return formatWatchTime(currentValue);
    default:
      return currentValue;
  }
};

const getProgressPercent = (quest) => {
  if (quest.targetValue === 0) return 100;
  return Math.min(100, Math.round((quest.currentValue / quest.targetValue) * 100));
};

const actionButtonClassName =
  "flex items-center justify-center gap-1.5 px-2 md:px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed";

const goNowButtonClassName = `${actionButtonClassName} bg-account-bg-tertiary text-account-text-primary hover:bg-account-border`;

const QuestCard = ({ quest, onClaim, onGoNow, isClaiming = false }) => {
  const { title, description, icon, isCompleted, isClaimed, rewardCoins, canClaim } = quest;

  const progress = getProgressPercent(quest);
  const targetLabel = getTargetLabel(quest);
  const currentLabel = getCurrentLabel(quest);

  if (isClaimed) {
    return (
      <div className={`${cardStyles.container} opacity-60`}>
        <div className={`${cardStyles.body} flex items-center gap-4`}>
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <i className={`fas ${icon || "fa-solid fa-star"} text-green-400 text-lg`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-account-text-primary">{title}</span>
            </div>
            {description && (
              <p className="text-xs text-account-text-secondary mt-0.5">{description}</p>
            )}
            <div className="mt-2 h-1.5 bg-green-500/20 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: "100%" }} />
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col gap-2 min-w-20 md:min-w-[120px]">
            <div className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold">
              <i className="fa-solid fa-check" />
              Đã nhận
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted && !isClaimed) {
    return (
      <div
        className={`${cardStyles.container} border-primaryColor/40 bg-primaryColor/5`}
        style={{ boxShadow: "0 0 16px rgb(var(--ui-loading)/0.08)" }}
      >
        <div className={`${cardStyles.body} flex items-center gap-4`}>
          <div className="w-12 h-12 rounded-xl bg-primaryColor/10 flex items-center justify-center flex-shrink-0">
            <i className={`fas ${icon || "fa-solid fa-star"} text-primaryColor text-lg`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-account-text-primary">{title}</span>
            </div>
            {description && (
              <p className="text-xs text-account-text-secondary mt-0.5">{description}</p>
            )}
            <div className="mt-2 h-1.5 bg-primaryColor/20 rounded-full overflow-hidden">
              <div className="h-full bg-primaryColor rounded-full" style={{ width: "100%" }} />
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col gap-2 min-w-20 md:min-w-[120px]">
            <button
              onClick={onClaim}
              disabled={isClaiming || !canClaim}
              className={`${actionButtonClassName} bg-primaryColor text-black hover:opacity-85`}
            >
              <i className="fa-solid fa-gift" />
              {isClaiming ? "Đang nhận..." : `+${rewardCoins} coin`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardStyles.container}>
      <div className={`${cardStyles.body} flex items-center gap-4`}>
        <div className="w-12 h-12 rounded-xl bg-account-bg-tertiary flex items-center justify-center flex-shrink-0">
          <i className={`fas ${icon || "fa-solid fa-star"} text-account-text-secondary text-lg`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-account-text-primary">{title}</span>
            <span className="flex-shrink-0 text-xs text-account-text-secondary">
              {currentLabel} / {targetLabel}
            </span>
          </div>
          {description && (
            <p className="text-xs text-account-text-secondary mt-0.5">{description}</p>
          )}
          <div className="mt-2 h-1.5 bg-account-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: "rgb(var(--ui-loading))" }}
            />
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col gap-2 min-w-20 md:min-w-[120px]">
          <button onClick={onGoNow} className={goNowButtonClassName}>
            <i className="fa-solid fa-house" />
            Đi ngay
          </button>
          <div className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-full bg-primaryColor/10 text-primaryColor text-xs font-semibold">
            <i className="fa-solid fa-coins text-[10px]" />
            {rewardCoins}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestCard;
