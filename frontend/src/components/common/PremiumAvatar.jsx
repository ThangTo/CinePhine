import React from "react";
import { getAvatarCostume, getAvatarUrlByKey, handleAvatarError } from "utils/avatarUtils";
import { getTopRankTier } from "utils/userPrestige";

const PREMIUM_RING =
  "conic-gradient(from 0deg, #ffd875, #fde68a, #fbbf24, #f59e0b, #ffd875)";

const RANK_RING_BY_TIER = {
  1: "conic-gradient(from 0deg, #fff7c2, #ffd875, #f59e0b, #fff7c2)",
  2: "conic-gradient(from 0deg, #ffffff, #cbd5e1, #94a3b8, #ffffff)",
  3: "conic-gradient(from 0deg, #f8c27a, #c97a2b, #8a4b17, #f8c27a)",
};

const PremiumAvatar = ({
  src,
  alt = "Avatar",
  size = "w-10 h-10",
  isPremium = false,
  rank,
  className = "",
  imgClass = "",
}) => {
  const resolvedSrc = src || getAvatarUrlByKey(alt);
  const topRankTier = getTopRankTier(rank);
  const hasPrestige = isPremium || topRankTier;
  const costume = getAvatarCostume(alt);

  if (hasPrestige) {
    return (
      <div
        className={`site-avatar relative inline-flex shrink-0 overflow-visible rounded-full p-[2px] ${size} ${className}`}
        data-costume={costume}
        data-rank={topRankTier?.rank}
        style={{
          background: topRankTier ? RANK_RING_BY_TIER[topRankTier.rank] : PREMIUM_RING,
          animation: "premiumGlow 2.5s ease-in-out infinite",
        }}
      >
        <div className="relative z-10 h-full w-full overflow-hidden rounded-full bg-[#111]">
          <img
            src={resolvedSrc}
            alt={alt}
            className={`w-full h-full object-cover ${imgClass}`}
            onError={handleAvatarError}
          />
        </div>
        {/* Halloween #1: carved face + embers (styled in themes.css, hidden otherwise). */}
        {topRankTier?.rank === 1 && <span className="site-avatar-fx" aria-hidden="true" />}

        {isPremium && (
          <div
            className="pointer-events-none absolute bottom-0 right-0 z-20 flex translate-x-1/4 translate-y-1/4 items-center justify-center animate-crown-float"
            style={{
              filter: "drop-shadow(0 0 4px rgba(255,216,117,0.8))",
            }}
          >
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] ring-2 ring-[#111]"
              style={{
                background: "linear-gradient(135deg, #fde68a, #f59e0b)",
                border: "1.5px solid rgba(255,216,117,0.8)",
              }}
            >
              <i className="fa-solid fa-crown text-yellow-900" />
            </div>
          </div>
        )}

        {topRankTier && (
          <div
            className={`absolute -left-1.5 -top-1.5 z-20 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ring-2 ring-[#0b1018] ${topRankTier.badgeClassName}`}
            style={{ filter: "drop-shadow(0 0 5px rgba(0,0,0,0.5))" }}
          >
            #{topRankTier.rank}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`site-avatar relative inline-flex shrink-0 overflow-visible rounded-full bg-[#111] ${size} ${className}`}
      data-costume={costume}
    >
      <img
        src={resolvedSrc}
        alt={alt}
        className={`h-full w-full rounded-full object-cover ring-2 ring-white/10 ${imgClass}`}
        onError={handleAvatarError}
      />
    </div>
  );
};

export default PremiumAvatar;
