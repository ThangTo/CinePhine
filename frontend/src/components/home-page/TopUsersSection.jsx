import { useEffect, useState, useRef, useCallback } from "react";
import ScrollContainer from "components/common/ScrollContainer";
import { BarSpinner } from "components/common/LoadingState";
import EmptyState from "components/common/EmptyState";
import leaderboardService from "services/leaderboard.service";
import formatWatchDuration from "utils/formatWatchDuration";
import { getAvatarUrlByKey, handleAvatarError } from "utils/avatarUtils";
import { getUserPrestige } from "utils/userPrestige";

// --- COMPONENT HIỆU ỨNG PHÉP THUẬT DÒNG CHẢY KIM TUYẾN ---
const MagicFlowBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    let particles = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    class Particle {
      constructor() {
        this.reset();
        this.y = Math.random() * canvas.height; // Khởi tạo ngẫu nhiên toàn màn hình ban đầu
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = canvas.height + 10;
        this.size = Math.random() * 1.5 + 0.5; // Kích thước kim tuyến
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * -1 - 0.5; // Tốc độ trôi lên
        this.life = Math.random() * Math.PI * 2; // Chu kỳ lấp lánh

        // Lấy dải màu primary của giao diện bạn đang dùng
        const colors = ["#ffd875", "#ffe39f", "#22d3ee", "#ffffff"];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }
      update() {
        // Trôi lượn sóng nhẹ nhàng như dòng cát/phép thuật
        this.x += this.speedX + Math.sin(this.y * 0.01 + this.life) * 0.3;
        this.y += this.speedY;
        this.life += 0.05;

        // Hiệu ứng nhấp nháy lấp lánh
        this.opacity = ((Math.sin(this.life) + 1) / 2) * 0.8 + 0.1;

        // Reset hạt khi bay khỏi màn hình
        if (this.y < -10) {
          this.reset();
        }
      }
      draw() {
        ctx.globalAlpha = this.opacity;
        ctx.shadowBlur = 8; // Tạo hiệu ứng phát sáng mờ (glow)
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const init = () => {
      particles = [];
      // Số lượng hạt kim tuyến (bạn có thể tăng giảm tùy ý)
      for (let i = 0; i < 80; i++) {
        particles.push(new Particle());
      }
    };
    init();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full mix-blend-screen opacity-70"
    />
  );
};
// --------------------------------------------------------

const PODIUM_STYLES = {
  1: {
    label: "Quán quân",
    icon: "fa-crown",
    surface: "from-[#2f260d] via-[#181d29] to-[#10141d]",
    border: "border-[#ffd875]/40",
    shadow: "shadow-[0_24px_80px_rgba(255,216,117,0.16)]",
    badge: "bg-gradient-to-br from-[#ffe39f] via-[#ffd875] to-[#f3a70b] text-[#18130a]",
    accent: "text-[#ffd875]",
    height: "lg:-translate-y-8",
  },
  2: {
    label: "Á quân",
    icon: "fa-medal",
    surface: "from-[#273040] via-[#171d2a] to-[#10141d]",
    border: "border-[#cbd5e1]/25",
    shadow: "shadow-[0_24px_70px_rgba(148,163,184,0.14)]",
    badge: "bg-gradient-to-br from-[#e5edf7] via-[#cbd5e1] to-[#94a3b8] text-[#10121b]",
    accent: "text-[#d8e1ee]",
    height: "lg:translate-y-3",
  },
  3: {
    label: "Phong độ cao",
    icon: "fa-fire",
    surface: "from-[#342012] via-[#191924] to-[#10141d]",
    border: "border-[#f59e0b]/25",
    shadow: "shadow-[0_24px_70px_rgba(249,115,22,0.16)]",
    badge: "bg-gradient-to-br from-[#f8c27a] via-[#c97a2b] to-[#8a4b17] text-white",
    accent: "text-[#f6b75e]",
    height: "lg:translate-y-6",
  },
};

const clampNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatScore = (value) => clampNumber(value).toLocaleString("vi-VN");

const getRankBadgeClassName = (rank) =>
  PODIUM_STYLES[rank]?.badge || "bg-[#131927] text-white ring-1 ring-white/10";

const buildLeaderboardEntries = (users) =>
  users.map((user, index) => ({
    user,
    rank: index + 1,
  }));

const UserAvatar = ({ src, username, rank, isPremium = false, className = "h-14 w-14" }) => {
  const prestige = getUserPrestige({ isPremium }, rank);
  const ringClassName =
    prestige.topRankTier?.ringClassName ||
    (prestige.isPremium
      ? "ring-primaryColor/60 shadow-[0_0_22px_rgba(243,191,26,0.25)]"
      : "ring-white/10");

  return (
    <div className={`relative shrink-0 overflow-visible ${className}`}>
      <div className={`h-full w-full overflow-hidden rounded-2xl bg-white/5 ring-2 ${ringClassName}`}>
        <img
          src={src || getAvatarUrlByKey(username)}
          alt={username}
          className="h-full w-full object-cover"
          onError={handleAvatarError}
        />
      </div>

      {prestige.topRankTier && (
        <div
          className={`absolute -left-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${prestige.topRankTier.badgeClassName}`}
        >
          #{prestige.topRankTier.rank}
        </div>
      )}

      {prestige.isPremium && (
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-[#ffd875]/60 bg-gradient-to-br from-[#fde68a] to-[#f59e0b] text-[11px] text-yellow-950 shadow-[0_0_12px_rgba(255,216,117,0.45)]">
          <i className="fa-solid fa-crown" />
        </div>
      )}
    </div>
  );
};

const PrestigeBadges = ({ user, rank, compact = false, className = "" }) => {
  const prestige = getUserPrestige(user, rank);

  if (!prestige.hasPrestige) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {prestige.topRankTier && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold ${compact ? "text-[10px]" : "text-[11px]"} ${prestige.topRankTier.badgeClassName}`}
        >
          <i className={`fa-solid ${prestige.topRankTier.icon}`} />
          {prestige.topRankTier.shortTitle}
        </span>
      )}
      {prestige.isPremium && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-primaryColor/40 bg-primaryColor/15 px-2 py-1 font-bold text-primaryColor ${compact ? "text-[10px]" : "text-[11px]"}`}
        >
          <i className="fa-solid fa-crown" />
          Premium
        </span>
      )}
    </div>
  );
};

const HeaderStat = ({ label, value, iconClassName, compact = false }) => (
  <div
    className={`rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm ${
      compact ? "min-w-0 px-3 py-2.5" : "px-4 py-3"
    }`}
  >
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-gray-400">
      <i className={`fa-solid ${iconClassName} text-primaryColor`} />
      <span>{label}</span>
    </div>
    <div
      className={`mt-2 font-semibold text-white ${compact ? "text-sm sm:text-base" : "text-lg sm:text-xl"}`}
    >
      {value}
    </div>
  </div>
);

const InfoChip = ({
  iconClassName,
  label,
  value,
  tone = "default",
  compact = false,
  className = "",
}) => {
  const toneClassName =
    tone === "accent"
      ? "border-primaryColor/20 bg-primaryColor/10 text-[#ffe7a8]"
      : "border-white/10 bg-white/5 text-gray-200";

  return (
    <div
      className={`rounded-2xl border px-3 ${compact ? "py-2" : "py-2.5"} ${toneClassName} ${className}`}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gray-400">
        <i className={`fa-solid ${iconClassName}`} />
        <span>{label}</span>
      </div>
      <div className={`mt-1 font-semibold ${compact ? "text-xs sm:text-sm" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
};

const MobileDetailsButton = ({ expanded, onToggle, className = "" }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={expanded}
    className={`inline-flex items-center gap-2 rounded-full border border-primaryColor/20 bg-primaryColor/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffe6a0] sm:hidden ${className}`}
  >
    <span>{expanded ? "Ẩn chi tiết" : "Xem chi tiết"}</span>
    <i className={`fa-solid ${expanded ? "fa-chevron-up" : "fa-chevron-down"} text-[10px]`} />
  </button>
);

const SectionHeader = ({ users, compact = false }) => {
  const [mobileSummaryExpanded, setMobileSummaryExpanded] = useState(false);
  const totalWatchTime = users.reduce((sum, user) => sum + clampNumber(user.totalWatchTime), 0);
  const highestStreak = users.reduce(
    (maxValue, user) => Math.max(maxValue, clampNumber(user.maxStreak)),
    0
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primaryColor/20 bg-primaryColor/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffe6a0]">
            <i className="fa-solid fa-trophy" />
            <span>Bảng xếp hạng</span>
          </div>
          <h2 className="mt-4 text-xl font-black tracking-tight text-white sm:text-3xl">
            Top 10 người xem hàng đầu
          </h2>

          <MobileDetailsButton
            expanded={mobileSummaryExpanded}
            onToggle={() => setMobileSummaryExpanded((current) => !current)}
            className="mt-4"
          />

          <div className={`${mobileSummaryExpanded ? "block" : "hidden"} mt-4 sm:hidden`}>
            <p className="max-w-2xl text-sm leading-6 text-gray-300">
              Điểm số được tính trên tổng thời lượng xem, chuỗi cao nhất và chuỗi hiện tại của người
              xem.
            </p>
            <p className="max-w-2xl text-sm leading-6 text-gray-300">
              Chẳng chờ gì mà chưa cày top !!!🥳🥳🥳
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <HeaderStat
                compact
                label="Tổng thời gian xem"
                value={formatWatchDuration(totalWatchTime)}
                iconClassName="fa-clock"
              />
              <HeaderStat
                compact
                label="Chuỗi dài nhất"
                value={`${highestStreak} ngày`}
                iconClassName="fa-fire"
              />
              <HeaderStat
                compact
                label="Số lượng"
                value={`${users.length}/10`}
                iconClassName="fa-users"
              />
            </div>
          </div>

          <div className="mt-3 hidden sm:block">
            <p className="max-w-2xl text-sm leading-6 text-gray-300 sm:text-[15px]">
              Điểm số được tính trên tổng thời lượng xem, chuỗi cao nhất và chuỗi hiện tại của người
              xem.
            </p>
            <p className="max-w-2xl text-sm leading-6 text-gray-300">
              Chẳng chờ gì mà chưa cày top !!!🥳🥳🥳
            </p>
          </div>
        </div>

        <div className="hidden shrink-0 sm:grid sm:grid-cols-3 sm:gap-3 xl:min-w-[420px]">
          <HeaderStat
            compact
            label="Tổng thời gian xem"
            value={formatWatchDuration(totalWatchTime)}
            iconClassName="fa-clock"
          />
          <HeaderStat
            compact
            label="Chuỗi dài nhất"
            value={`${highestStreak} ngày`}
            iconClassName="fa-fire"
          />
          <HeaderStat
            compact
            label="Số lượng"
            value={`${users.length}/10`}
            iconClassName="fa-users"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-primaryColor/20 bg-primaryColor/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffe6a0]">
          <i className="fa-solid fa-trophy" />
          <span>Bảng xếp hạng</span>
        </div>
        <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Top 10 người xem hàng đầu
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-gray-300 sm:text-base">
          Xếp hạng được tính theo tổng thời gian xem và chuỗi xem liên tục. Top 3 được làm nổi bật
          như một podium, còn các vị trí tiếp theo vẫn dễ so sánh nhanh.
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-gray-500">
          {users.length < 10
            ? `Đang hiển thị ${users.length} tài khoản trong bảng xếp hạng`
            : "Đang hiển thị đủ top 10"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
        <HeaderStat
          label="Tổng thời gian xem"
          value={formatWatchDuration(totalWatchTime)}
          iconClassName="fa-clock"
        />
        <HeaderStat
          label="Chuỗi dài nhất"
          value={`${highestStreak} ngày`}
          iconClassName="fa-fire"
        />
        <HeaderStat label="Số lượng" value={`${users.length}/10`} iconClassName="fa-users" />
      </div>
    </div>
  );
};

const LeaderboardShell = ({ users, children, compact = false }) => (
  <section
    className={`relative mx-auto ${compact ? "w-full px-3 py-4 sm:px-6 sm:py-6" : "max-w-6xl px-4 py-10 sm:px-6"}`}
  >
    <div className="absolute inset-x-8 top-20 h-40 rounded-full bg-primaryColor/10 blur-3xl" />
    <div className="absolute right-10 top-28 h-44 w-44 rounded-full bg-[#22d3ee]/10 blur-3xl" />

    <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0b1018] shadow-[0_35px_90px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--ui-primary)/0.08),transparent_24%,transparent_72%,rgba(34,211,238,0.08))]" />
      <div className="absolute left-[-80px] top-[-80px] h-56 w-56 rounded-full bg-primaryColor/10 blur-3xl" />
      <div className="absolute bottom-[-120px] right-[-80px] h-72 w-72 rounded-full bg-[#38bdf8]/10 blur-3xl" />

      {/* HIỆU ỨNG CANVAS ĐƯỢC CHÈN Ở ĐÂY VỚI Z-INDEX THẤP NHẤT */}
      <MagicFlowBackground />

      <div
        className={`relative z-10 ${compact ? "px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8" : "px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"}`}
      >
        <SectionHeader users={users} compact={compact} />
        <div className={compact ? "mt-6" : "mt-8"}>{children}</div>
      </div>
    </div>
  </section>
);

const PodiumCard = ({ user, rank }) => {
  const style = PODIUM_STYLES[rank] || PODIUM_STYLES[3];

  return (
    <article
      className={`group relative overflow-hidden rounded-[28px] border bg-gradient-to-br p-5 transition-all duration-300 hover:-translate-y-1 sm:p-6 ${style.surface} ${style.border} ${style.shadow} ${style.height}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_52%)] opacity-60" />
      <div className="absolute -right-10 top-8 h-28 w-28 rounded-full bg-white/10 blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div
              className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] ${style.accent}`}
            >
              <i className={`fa-solid ${style.icon}`} />
              <span>{style.label}</span>
            </div>
            <p className="mt-3 text-sm text-gray-300">Hạng #{rank}</p>
          </div>

          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black ${style.badge}`}
          >
            {rank}
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <UserAvatar
            src={user.avatar}
            username={user.username}
            rank={rank}
            isPremium={user.isPremium}
            className="h-16 w-16 rounded-[22px] ring-2 ring-white/10"
          />
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold text-white">{user.username}</h3>
            <PrestigeBadges user={user} rank={rank} className="mt-2" />
            <p className="mt-1 text-sm text-gray-400">Điểm xếp hạng {formatScore(user.score)}</p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
          <p className="text-[11px] uppercase tracking-[0.26em] text-gray-400">Thời gian xem</p>
          <p className="mt-2 text-3xl font-black text-white">
            {formatWatchDuration(user.totalWatchTime)}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <InfoChip
            iconClassName="fa-bolt"
            label="Chuỗi hiện tại"
            value={`${clampNumber(user.currentStreak)} ngày`}
            tone="accent"
          />
          <InfoChip
            iconClassName="fa-star"
            label="Kỷ lục"
            value={`${clampNumber(user.maxStreak)} ngày`}
          />
        </div>
      </div>
    </article>
  );
};

const LeaderboardRow = ({ user, rank, maxScore }) => {
  const score = clampNumber(user.score);
  const progressWidth = maxScore > 0 ? Math.max(12, Math.round((score / maxScore) * 100)) : 12;

  return (
    <article className="group relative z-10 rounded-[26px] border border-white/10 bg-white/[0.04] p-4 transition-all duration-300 hover:border-primaryColor/30 hover:bg-white/[0.06] backdrop-blur-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#131927] text-lg font-black text-white ring-1 ring-white/10">
            {rank}
          </div>

          <UserAvatar
            src={user.avatar}
            username={user.username}
            rank={rank}
            isPremium={user.isPremium}
          />

          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white">{user.username}</h3>
            <PrestigeBadges user={user} rank={rank} compact className="mt-1" />
            <p className="mt-1 text-sm text-gray-400">
              Đã xem {formatWatchDuration(user.totalWatchTime)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[420px]">
          <InfoChip
            iconClassName="fa-clock"
            label="Thời gian xem"
            value={formatWatchDuration(user.totalWatchTime)}
            tone="accent"
          />
          <InfoChip
            iconClassName="fa-fire"
            label="Hiện tại"
            value={`${clampNumber(user.currentStreak)} ngày`}
          />
          <InfoChip
            iconClassName="fa-trophy"
            label="Cao nhất"
            value={`${clampNumber(user.maxStreak)} ngày`}
          />
          <InfoChip iconClassName="fa-chart-line" label="Điểm" value={formatScore(user.score)} />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-gray-500">
          <span>Phong độ</span>
          <span>{progressWidth}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primaryColor via-[#f59e0b] to-[#fb7185] transition-all duration-500"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>
    </article>
  );
};

const HorizontalHeroCard = ({ user }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="relative z-10 overflow-hidden rounded-[28px] border border-[#ffd875]/30 bg-gradient-to-br from-[#2f260d] via-[#171d2a] to-[#10141d] p-4 shadow-[0_24px_80px_rgba(255,216,117,0.16)] sm:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_55%)] opacity-70" />
      <div className="absolute -right-10 top-6 h-28 w-28 rounded-full bg-[#ffd875]/15 blur-3xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ffd875]/20 bg-[#ffd875]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffe6a0]">
              <i className="fa-solid fa-crown" />
              <span>Quán quân hiện tại</span>
            </div>
            <p className="mt-3 text-sm text-gray-300">Hạng #1</p>
          </div>

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffe39f] via-[#ffd875] to-[#f3a70b] text-lg font-black text-[#18130a]">
            1
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 sm:gap-4">
          <UserAvatar
            src={user.avatar}
            username={user.username}
            rank={1}
            isPremium={user.isPremium}
            className="h-14 w-14 rounded-[20px] ring-2 ring-[#ffd875]/20 sm:h-16 sm:w-16 sm:rounded-[22px]"
          />
          <div className="min-w-0">
            <h3 className="truncate text-xl font-black text-white sm:text-2xl">{user.username}</h3>
            <PrestigeBadges user={user} rank={1} className="mt-2" />
            <p className="mt-1 text-sm text-gray-300">
              Đã xem {formatWatchDuration(user.totalWatchTime)}
            </p>
          </div>
        </div>

        <MobileDetailsButton
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
          className="mt-4"
        />

        <div className={`${expanded ? "block" : "hidden"} mt-4 sm:mt-5 sm:block`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <InfoChip
              compact
              iconClassName="fa-chart-line"
              label="Điểm"
              value={formatScore(user.score)}
              tone="accent"
            />
            <InfoChip
              compact
              iconClassName="fa-fire"
              label="Hiện tại"
              value={`${clampNumber(user.currentStreak)} ngày`}
            />
            <InfoChip
              compact
              iconClassName="fa-star"
              label="Kỷ lục"
              value={`${clampNumber(user.maxStreak)} ngày`}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </div>
    </article>
  );
};

const HorizontalRankCard = ({ user, rank, maxScore }) => {
  const [expanded, setExpanded] = useState(false);
  const score = clampNumber(user.score);
  const progressWidth = maxScore > 0 ? Math.max(12, Math.round((score / maxScore) * 100)) : 12;

  return (
    <article className="relative z-10 w-[74vw] max-w-[220px] shrink-0 snap-start rounded-[24px] border border-white/10 bg-white/[0.04] p-3.5 transition-all duration-300 hover:-translate-y-1 hover:border-primaryColor/30 hover:bg-white/[0.06] sm:w-[250px] sm:max-w-none sm:p-4 lg:w-[280px] backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-black ${getRankBadgeClassName(rank)}`}
          >
            {rank}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">Hạng #{rank}</p>
            <h3 className="truncate text-base font-semibold text-white">{user.username}</h3>
          </div>
        </div>

        <UserAvatar
          src={user.avatar}
          username={user.username}
          rank={rank}
          isPremium={user.isPremium}
          className="h-12 w-12 rounded-[18px]"
        />
      </div>

      <div className="mt-3">
        <InfoChip
          compact
          iconClassName="fa-clock"
          label="Đã xem"
          value={formatWatchDuration(user.totalWatchTime)}
          tone="accent"
        />
        <PrestigeBadges user={user} rank={rank} compact className="mt-2" />

        <MobileDetailsButton
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
          className="mt-3"
        />

        <div className={`${expanded ? "block" : "hidden"} mt-3 sm:mt-2 sm:block`}>
          <div className="grid grid-cols-2 gap-2">
            <InfoChip
              compact
              iconClassName="fa-fire"
              label="Hiện tại"
              value={`${clampNumber(user.currentStreak)} ngày`}
            />
            <InfoChip
              compact
              iconClassName="fa-chart-line"
              label="Điểm"
              value={formatScore(user.score)}
            />
            <InfoChip
              compact
              iconClassName="fa-star"
              label="Kỷ lục"
              value={`${clampNumber(user.maxStreak)} ngày`}
              className="col-span-2"
            />
          </div>

          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-gray-500">
              <span>Phong độ</span>
              <span>{progressWidth}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primaryColor via-[#f59e0b] to-[#fb7185]"
                style={{ width: `${progressWidth}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

const VerticalLeaderboardContent = ({ users }) => {
  const leaderboardEntries = buildLeaderboardEntries(users);
  const topThree = leaderboardEntries.slice(0, 3);
  const podiumEntries = topThree.length === 3 ? [topThree[1], topThree[0], topThree[2]] : topThree;
  const remainingEntries = leaderboardEntries.slice(3);
  const maxScore = clampNumber(users[0]?.score);

  return (
    <div className="space-y-8">
      <div className="grid gap-5 lg:grid-cols-3 lg:items-end">
        {podiumEntries.map(({ user, rank }) => (
          <PodiumCard key={user.id || `${user.username}-${rank}`} user={user} rank={rank} />
        ))}
      </div>

      {remainingEntries.length > 0 && (
        <div className="relative z-10 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Vị trí 4-10
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">Bảng xếp hạng đầy đủ</h3>
            </div>
            <p className="text-sm text-gray-400">
              Giao diện gọn gàng để nhìn toàn bộ top 10 và so sánh từng người nhanh hơn.
            </p>
          </div>

          <div className="space-y-3">
            {remainingEntries.map(({ user, rank }) => (
              <LeaderboardRow
                key={user.id || `${user.username}-${rank}`}
                user={user}
                rank={rank}
                maxScore={maxScore}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const HorizontalLeaderboardContent = ({ users }) => {
  const leaderboardEntries = buildLeaderboardEntries(users);
  const championEntry = leaderboardEntries[0];
  const remainingEntries = leaderboardEntries.slice(1);
  const maxScore = clampNumber(users[0]?.score);

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-5">
      <div>
        <HorizontalHeroCard user={championEntry.user} />
      </div>

      {remainingEntries.length > 0 && (
        <div className="relative z-10 min-w-0 rounded-[28px] border border-white/10 bg-white/[0.03] p-3.5 sm:p-5 backdrop-blur-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Vị trí 2-10
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">Nhóm bám đuổi</h3>
            </div>
            <p className="text-sm text-gray-400">Cố lên, cố lên!! Sắp tới òi 💓</p>
          </div>

          <div className="sm:hidden -mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [touch-action:pan-x]">
            <div className="flex snap-x snap-mandatory gap-3 overscroll-x-contain">
              {remainingEntries.map(({ user, rank }) => (
                <HorizontalRankCard
                  key={user.id || `${user.username}-${rank}`}
                  user={user}
                  rank={rank}
                  maxScore={maxScore}
                />
              ))}
            </div>
          </div>

          <div className="hidden sm:block">
            <ScrollContainer gap="gap-3 sm:gap-4" showArrows className="pr-1 sm:pr-2">
              {remainingEntries.map(({ user, rank }) => (
                <HorizontalRankCard
                  key={user.id || `${user.username}-${rank}`}
                  user={user}
                  rank={rank}
                  maxScore={maxScore}
                />
              ))}
            </ScrollContainer>
          </div>
        </div>
      )}
    </div>
  );
};

const TopUsersSectionBase = ({ variant = "horizontal" }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isCompact = variant === "horizontal";
  const isMountedRef = useRef(false);

  const fetchLeaderboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent && isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const data = await leaderboardService.getTopUsersLeaderboard();
      if (!isMountedRef.current) return;
      setUsers(Array.isArray(data) ? data.slice(0, 10) : []);
      setError(null);
    } catch (err) {
      console.error("[TopUsersSection]", err);
      if (!isMountedRef.current || silent) return;
      setError("Không thể tải bảng xếp hạng lúc này.");
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchLeaderboard();

    const refreshLeaderboard = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      fetchLeaderboard({ silent: true });
    };

    const intervalId = window.setInterval(refreshLeaderboard, 60000);
    window.addEventListener("focus", refreshLeaderboard);
    document.addEventListener("visibilitychange", refreshLeaderboard);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLeaderboard);
      document.removeEventListener("visibilitychange", refreshLeaderboard);
    };
  }, [fetchLeaderboard]);

  if (loading) {
    return (
      <LeaderboardShell users={[]} compact={isCompact}>
        <BarSpinner className="w-full py-12" />
      </LeaderboardShell>
    );
  }

  if (error || users.length === 0) {
    return (
      <LeaderboardShell users={[]} compact={isCompact}>
        <EmptyState
          title="Chưa có dữ liệu bảng xếp hạng"
          message={error ?? "Hãy là người đầu tiên bắt đầu xem để leo lên top đầu."}
          iconClassName="fa-film"
          actionLabel="Thử lại"
          onAction={fetchLeaderboard}
        />
      </LeaderboardShell>
    );
  }

  return (
    <LeaderboardShell users={users} compact={isCompact}>
      {variant === "vertical" ? (
        <VerticalLeaderboardContent users={users} />
      ) : (
        <HorizontalLeaderboardContent users={users} />
      )}
    </LeaderboardShell>
  );
};

export const TopUsersSectionVertical = () => <TopUsersSectionBase variant="vertical" />;

export const TopUsersSectionHorizontal = () => <TopUsersSectionBase variant="horizontal" />;

const TopUsersSection = ({ variant = "horizontal" }) => <TopUsersSectionBase variant={variant} />;

export default TopUsersSection;
