import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "hooks/useAuth";
import userService from "services/user.service";

const MINUTES_THRESHOLD = 10;
const DAYS_TO_MILESTONE = [7, 30, 100, 365];

// Milestone labels
const MILESTONE_LABELS = {
  7: "Tuần",
  30: "Tháng",
  100: "Trăm",
  365: "Năm",
};

const MILESTONE_ICONS = {
  7: "fa-calendar-week",
  30: "fa-calendar",
  100: "fa-fire-flame-curved",
  365: "fa-crown",
};

const startOfCalendarDay = (date) => {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
};

const getCalendarDateKey = (date) => {
  const normalizedDate = startOfCalendarDay(date);
  return `${normalizedDate.getFullYear()}-${normalizedDate.getMonth() + 1}-${normalizedDate.getDate()}`;
};

export const buildCurrentStreakDateKeys = (lastQualifiedWatchDate, currentStreak) => {
  const streakDateKeys = new Set();
  if (!lastQualifiedWatchDate || currentStreak <= 0) return streakDateKeys;

  const streakEndDate = startOfCalendarDay(lastQualifiedWatchDate);
  for (let dayOffset = 0; dayOffset < currentStreak; dayOffset += 1) {
    const streakDate = new Date(streakEndDate);
    streakDate.setDate(streakEndDate.getDate() - dayOffset);
    streakDateKeys.add(getCalendarDateKey(streakDate));
  }

  return streakDateKeys;
};

const WatchStreak = ({ compact = false }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [streak, setStreak] = useState(null);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [showCard, setShowCard] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;

    const fetchStreak = async () => {
      try {
        const data = await userService.getStreak();
        if (isMounted && data) {
          setStreak(data);
          if (data.todayProgress !== undefined && data.todayProgress !== null) {
            setTodaySeconds((data.todayProgress || 0) * 60);
          }
        }
      } catch {}
    };

    fetchStreak();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const handleStreakUpdated = (event) => {
      const data = event?.detail;
      if (!data) return;

      setStreak(data);

      if (data.todayProgress !== undefined && data.todayProgress !== null) {
        setTodaySeconds((data.todayProgress || 0) * 60);
        return;
      }

      if (data.minutesWatchedToday !== undefined && data.minutesWatchedToday !== null) {
        setTodaySeconds((data.minutesWatchedToday || 0) * 60);
      }
    };

    window.addEventListener("watch-streak-updated", handleStreakUpdated);
    return () => {
      window.removeEventListener("watch-streak-updated", handleStreakUpdated);
    };
  }, [isAuthenticated]);

  // Close card on outside click (when card is visible)
  useEffect(() => {
    if (!showCard) return;
    const handleClick = (e) => {
      // Don't close if click is on the button or the fixed card itself
      const onButton = e.target.closest("[data-streak-root]");
      const onCard = e.target.closest("[data-streak-card]");
      if (!onButton && !onCard) {
        setShowCard(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setShowCard(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showCard]);

  if (!isAuthenticated) return null;

  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;
  const isActiveToday = streak?.isActiveToday ?? false;

  const progressMinutes = Math.floor(todaySeconds / 60);
  const progressPercent = Math.min(100, Math.round((progressMinutes / MINUTES_THRESHOLD) * 100));

  // Milestone helpers
  const nextMilestone = DAYS_TO_MILESTONE.find((m) => m > currentStreak) ?? currentStreak;
  const daysToNext = nextMilestone - currentStreak;

  // Build week calendar (7 cells: 3 past + today + 3 future)
  const today = startOfCalendarDay(new Date());
  const dayOfWeek = (today.getDay() + 6) % 7; // Mon=0, Sun=6

  const weekDays = [];
  for (let i = -dayOfWeek; i <= 6 - dayOfWeek; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    weekDays.push({ date: d, dayName: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i + dayOfWeek] });
  }

  const streakDateKeys = buildCurrentStreakDateKeys(
    streak?.lastQualifiedWatchDate,
    currentStreak,
  );

  // Compact version — used in header
  if (compact) {
    return (
      <div data-streak-root>
        <button
          onClick={() => setShowCard((v) => !v)}
          className={`
            relative flex items-center gap-2 laptop-sm:gap-1 px-3 laptop-sm:px-2 py-1.5 rounded-full text-xs font-medium
            transition-all duration-300 border backdrop-blur-md
            ${
              currentStreak > 0
                ? "bg-primaryColor/10 border-primaryColor/30 text-primaryColor shadow-lg shadow-primaryColor/10"
                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
            }
          `}
        >
          {/* Animated fire SVG */}
          <span className={`relative inline-flex ${currentStreak > 0 ? "animate-wiggle" : ""}`}>
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
              className={
                currentStreak > 0
                  ? "text-primaryColor drop-shadow-[0_0_4px_rgb(var(--ui-primary)/0.6)]"
                  : "text-gray-400"
              }
            >
              <path d="M12 2c0 0-5 6.5-5 11a5 5 0 0 0 10 0c0-4.5-5-11-5-11zm0 14.5a2.5 2.5 0 0 1-2.5-2.5c0-1.5 2.5-5.5 2.5-5.5s2.5 4 2.5 5.5a2.5 2.5 0 0 1-2.5 2.5z" />
            </svg>
          </span>

          <span className="font-bold">{currentStreak}</span>
          <span className="text-gray-400 laptop-sm:hidden">ngày</span>

          {/* Pulsing dot if active today */}
          {isActiveToday && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primaryColor opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primaryColor" />
            </span>
          )}
        </button>

        {/* Card renders directly below button via absolute, above header content */}
        {showCard && (
          <div
            data-streak-card
            className="fixed right-50% top-[calc(var(--app-header-total-height)+0.5rem)] z-[9999]"
          >
            <StreakCard
              streak={streak}
              currentStreak={currentStreak}
              longestStreak={longestStreak}
              isActiveToday={isActiveToday}
              progressMinutes={progressMinutes}
              progressPercent={progressPercent}
              nextMilestone={nextMilestone}
              daysToNext={daysToNext}
              weekDays={weekDays}
              streakDateKeys={streakDateKeys}
              today={today}
              onClose={() => setShowCard(false)}
              onNavigate={() => {
                setShowCard(false);
                navigate("/account?tabs=streak");
              }}
              standalone={false}
            />
          </div>
        )}
      </div>
    );
  }

  // ===== FULL PAGE VERSION (Account page) =====
  return (
    <StreakCard
      streak={streak}
      currentStreak={currentStreak}
      longestStreak={longestStreak}
      isActiveToday={isActiveToday}
      progressMinutes={progressMinutes}
      progressPercent={progressPercent}
      nextMilestone={nextMilestone}
      daysToNext={daysToNext}
      weekDays={weekDays}
      streakDateKeys={streakDateKeys}
      today={today}
      onClose={() => {}}
      onNavigate={() => {}}
      standalone
    />
  );
};

// ===== STREAK CARD — shared between compact + standalone =====
const StreakCard = ({
  streak,
  currentStreak,
  longestStreak,
  isActiveToday,
  progressMinutes,
  progressPercent,
  nextMilestone,
  daysToNext,
  weekDays,
  streakDateKeys,
  today,
  onClose,
  onNavigate,
  standalone = false,
  inPortal = false,
}) => {
  const isZero = currentStreak === 0;

  // Determine state messages
  const getStateMessage = () => {
    if (isActiveToday) return "Hôm nay đã xem! 🎉";
    if (currentStreak === 0) return "Bắt đầu chuỗi hôm nay nhé!";
    return "Xem phim để giữ chuỗi nhé!";
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-3xl
        bg-bgColor2/95 backdrop-blur-2xl
        border border-white/10
        shadow-2xl shadow-black/50
        ${standalone ? "w-full p-6" : "w-[340px] p-5"}
      `}
    >
      {/* ---- Background decorative glows ---- */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-primaryColor/12 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-orange-500/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primaryColor/30 to-transparent pointer-events-none" />

      {/* ---- Close button (compact mode only) ---- */}
      {!standalone && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full
            bg-white/5 border border-white/10 text-gray-400 hover:bg-white/20 hover:text-white
            transition-colors text-xs z-20"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      )}

      {/* ---- CONTENT ---- */}
      <div className="relative z-10">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {/* Animated fire icon */}
            <div className={`relative ${currentStreak > 0 ? "animate-wiggle" : ""}`}>
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
                className={
                  isZero
                    ? "text-gray-500"
                    : "text-primaryColor drop-shadow-[0_0_6px_rgb(var(--ui-primary)/0.5)]"
                }
              >
                <path d="M12 2c0 0-5 6.5-5 11a5 5 0 0 0 10 0c0-4.5-5-11-5-11zm0 14.5a2.5 2.5 0 0 1-2.5-2.5c0-1.5 2.5-5.5 2.5-5.5s2.5 4 2.5 5.5a2.5 2.5 0 0 1-2.5 2.5z" />
              </svg>
              {currentStreak > 0 && (
                <div className="absolute inset-0 rounded-full animate-ping opacity-30">
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="currentColor"
                    className="text-primaryColor"
                  >
                    <path d="M12 2c0 0-5 6.5-5 11a5 5 0 0 0 10 0c0-4.5-5-11-5-11zm0 14.5a2.5 2.5 0 0 1-2.5-2.5c0-1.5 2.5-5.5 2.5-5.5s2.5 4 2.5 5.5a2.5 2.5 0 0 1-2.5 2.5z" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <h3
                className={`text-lg font-bold leading-none ${isZero ? "text-gray-400" : "text-primaryColor"}`}
              >
                {currentStreak.toLocaleString()}
              </h3>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mt-0.5">
                Ngày streak
              </p>
            </div>
          </div>

          {/* Status badge */}
          <div
            className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold
            border backdrop-blur-sm
            ${
              isActiveToday
                ? "bg-primaryColor/15 border-primaryColor/30 text-primaryColor"
                : currentStreak === 0
                  ? "bg-white/5 border-white/10 text-gray-500"
                  : "bg-orange-500/15 border-orange-500/30 text-orange-400"
            }
          `}
          >
            {isActiveToday ? (
              <>
                <i className="fa-solid fa-check-double text-[8px]" /> Hôm nay
              </>
            ) : currentStreak === 0 ? (
              <>
                <i className="fa-solid fa-play text-[8px]" /> Bắt đầu ngay
              </>
            ) : (
              <>
                <i className="fa-solid fa-fire text-[8px]" /> streak đang chạy
              </>
            )}
          </div>
        </div>

        {/* Week calendar strip */}
        <div className="mb-5">
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Chuỗi tuần này
          </p>
          <div className="flex items-center justify-between gap-1">
            {weekDays.map((day, i) => {
              const isToday = day.date.getTime() === today.getTime();
              const isPast = day.date < today;
              const isStreakDay = streakDateKeys.has(getCalendarDateKey(day.date));

              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1"
                  data-streak-qualified={isStreakDay}
                >
                  <span
                    className={`text-[9px] font-semibold ${isToday ? "text-primaryColor" : "text-gray-500"}`}
                  >
                    {day.dayName}
                  </span>
                  <div
                    className={`
                      w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold
                      transition-all duration-300
                      ${
                        isStreakDay
                          ? "bg-primaryColor text-black shadow-[0_0_10px_rgb(var(--ui-primary)/0.5)]"
                          : isToday && isActiveToday
                            ? "bg-primaryColor/30 border border-primaryColor/40 text-primaryColor"
                            : isToday
                              ? "bg-white/10 border border-primaryColor/30 text-primaryColor"
                              : isPast
                                ? "bg-white/5 border border-white/5 text-gray-600"
                                : "bg-white/5 border border-white/5 text-gray-600"
                      }
                    `}
                  >
                    {day.date.getDate()}
                  </div>
                  {isStreakDay && <i className="fa-solid fa-check text-[6px] text-primaryColor" />}
                  {isToday && !isStreakDay && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primaryColor animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Longest streak */}
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <i className="fa-solid fa-trophy text-yellow-400 text-[10px]" />
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                Kỷ lục
              </span>
            </div>
            <div className="text-xl font-black text-white leading-none">
              {longestStreak.toLocaleString()}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">ngày</div>
          </div>

          {/* Next milestone */}
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <i
                className={`fa-solid ${MILESTONE_ICONS[nextMilestone] || "fa-flag"} text-primaryColor text-[10px]`}
              />
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                Mốc tiếp
              </span>
            </div>
            <div
              className="text-xl font-black text-primaryColor leading-none"
              title={MILESTONE_LABELS[nextMilestone] || undefined}
            >
              {nextMilestone.toLocaleString()}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {daysToNext > 0 ? `còn ${daysToNext} ngày` : "đã đạt!"}
            </div>
          </div>
        </div>

        {/* Today's progress bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
              Hôm nay
            </span>
            <span
              className={`text-xs font-bold ${isActiveToday ? "text-primaryColor" : "text-gray-400"}`}
            >
              {isActiveToday
                ? `✓ Hoàn thành (${progressMinutes}/${MINUTES_THRESHOLD} phút)`
                : `${progressMinutes}/${MINUTES_THRESHOLD} phút`}
            </span>
          </div>

          {/* Progress bar with shimmer */}
          <div className="relative h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden
                ${
                  isActiveToday
                    ? "bg-gradient-to-r from-primaryColor to-yellow-300 shadow-[0_0_10px_rgb(var(--ui-primary)/0.5)]"
                    : "bg-gradient-to-r from-primaryColor/70 to-primaryColor/90"
                }
              `}
              style={{ width: `${progressPercent}%` }}
            >
              {/* Shimmer overlay */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                  animation: "premiumShimmer 2s ease-in-out infinite",
                  backgroundSize: "200% 100%",
                }}
              />
            </div>
            {/* 10-min threshold marker */}
            {progressPercent < 100 && (
              <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: "100%" }} />
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">
            {isActiveToday
              ? "Chuỗi đã được giữ hôm nay! 🌟"
              : `Xem thêm ${MINUTES_THRESHOLD - progressMinutes} phút để giữ chuỗi`}
          </p>
        </div>

        {/* Motivational message */}
        <div
          className={`
          flex items-center gap-2.5 p-3 rounded-xl border text-xs font-medium
          ${
            isActiveToday
              ? "bg-primaryColor/10 border-primaryColor/20 text-primaryColor/90"
              : currentStreak === 0
                ? "bg-white/5 border-white/10 text-gray-400"
                : "bg-orange-500/8 border-orange-500/15 text-orange-300/90"
          }
        `}
        >
          <i
            className={`fa-solid ${
              isActiveToday ? "fa-sparkles" : currentStreak === 0 ? "fa-rocket" : "fa-fire"
            } text-sm`}
          />
          <span>{getStateMessage()}</span>
        </div>
      </div>
    </div>
  );
};

export default WatchStreak;
