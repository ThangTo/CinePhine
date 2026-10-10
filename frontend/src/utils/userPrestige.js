import { isPremiumActive } from "utils/premiumUtils";

export const TOP_RANK_TIERS = {
  1: {
    rank: 1,
    label: "Hạng 1",
    title: "Quán quân rạp",
    shortTitle: "Quán quân",
    icon: "fa-crown",
    ringClassName: "ring-[#ffd875]/70 shadow-[0_0_28px_rgba(255,216,117,0.32)]",
    badgeClassName: "bg-gradient-to-br from-[#fff2b8] via-[#ffd875] to-[#f59e0b] text-[#221500]",
    surfaceClassName: "border-[#ffd875]/35 bg-[#ffd875]/10",
    textClassName: "text-[#ffd875]",
  },
  2: {
    rank: 2,
    label: "Hạng 2",
    title: "Á quân bạc",
    shortTitle: "Á quân",
    icon: "fa-medal",
    ringClassName: "ring-slate-200/60 shadow-[0_0_24px_rgba(203,213,225,0.25)]",
    badgeClassName: "bg-gradient-to-br from-white via-slate-200 to-slate-400 text-[#111827]",
    surfaceClassName: "border-slate-200/25 bg-slate-200/10",
    textClassName: "text-slate-100",
  },
  3: {
    rank: 3,
    label: "Hạng 3",
    title: "Huy chương đồng",
    shortTitle: "Hạng ba",
    icon: "fa-award",
    ringClassName: "ring-amber-600/60 shadow-[0_0_24px_rgba(217,119,6,0.26)]",
    badgeClassName: "bg-gradient-to-br from-[#f8c27a] via-[#c97a2b] to-[#8a4b17] text-white",
    surfaceClassName: "border-amber-600/25 bg-amber-600/10",
    textClassName: "text-amber-200",
  },
};

const TOP_RANK_CONTAINER_CLASSES = {
  1: "border-[#ffd875]/35 ring-1 ring-[#ffd875]/20 shadow-[0_0_28px_rgba(255,216,117,0.18)]",
  2: "border-slate-200/25 ring-1 ring-slate-200/20 shadow-[0_0_24px_rgba(203,213,225,0.14)]",
  3: "border-amber-600/25 ring-1 ring-amber-600/20 shadow-[0_0_24px_rgba(217,119,6,0.16)]",
};

export const isUserPremiumDisplay = (user) => user?.isPremium === true || isPremiumActive(user);

export const getTopRankTier = (rank) => TOP_RANK_TIERS[Number(rank)] || null;

export const getUserPrestige = (user, rank) => {
  const topRankTier = getTopRankTier(rank);
  const isPremium = isUserPremiumDisplay(user);

  return {
    rank: Number(rank) || null,
    topRankTier,
    isTopRank: Boolean(topRankTier),
    isPremium,
    hasPrestige: Boolean(topRankTier || isPremium),
    displayTitle: topRankTier?.title || (isPremium ? "Premium" : ""),
    badgeLabel: topRankTier?.label || (isPremium ? "Premium" : ""),
  };
};

export const getPrestigeContainerClassName = (user, rank) => {
  const prestige = getUserPrestige(user, rank);
  const classes = [];

  if (prestige.topRankTier) {
    classes.push(TOP_RANK_CONTAINER_CLASSES[prestige.topRankTier.rank]);
  }

  if (prestige.isPremium) {
    classes.push(
      "border-primaryColor/35 ring-1 ring-primaryColor/20 shadow-[0_0_24px_rgb(var(--ui-primary)/0.12)]",
    );
  }

  return classes.join(" ");
};

export const getAdminPrestigePreview = (user, search = "") => {
  if (user?.role !== "admin") {
    return {
      isActive: false,
      rank: null,
      isPremium: false,
    };
  }

  const params = new URLSearchParams(search);
  const rank = Number(params.get("prestigePreviewRank"));
  const topRankTier = getTopRankTier(rank);
  const isPremium = params.get("prestigePreviewPremium") === "1";

  return {
    isActive: Boolean(topRankTier || isPremium),
    rank: topRankTier?.rank || null,
    isPremium,
  };
};
