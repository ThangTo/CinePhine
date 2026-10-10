import React from "react";
import { Link, useLocation } from "react-router-dom";
import { getPremiumSummary, isPremiumActive } from "utils/premiumUtils";
import PremiumAvatar from "components/common/PremiumAvatar";
import { getPrestigeContainerClassName, getUserPrestige } from "utils/userPrestige";

const DEFAULT_TAB = "profile";

const navItems = [
  {
    tab: "favorites",
    icon: "fa-heart",
    label: "Yêu thích",
  },
  {
    tab: "watchlist",
    icon: "fa-list",
    label: "Danh sách",
  },
  {
    tab: "continue-watching",
    icon: "fa-play",
    label: "Xem tiếp",
  },
  {
    tab: "notifications",
    icon: "fa-bell",
    label: "Thông báo",
  },
  {
    tab: "profile",
    icon: "fa-user",
    label: "Tài khoản",
  },
  {
    tab: "streak",
    icon: "fa-fire",
    label: "Chuỗi xem",
  },
  {
    tab: "effects",
    icon: "fa-wand-magic-sparkles",
    label: "Hiệu ứng",
  },
  {
    tab: "quests",
    icon: "fa-trophy",
    label: "Nhiệm vụ",
  },
  {
    tab: "coin-history",
    icon: "fa-receipt",
    label: "Lịch sử coin",
  },
];

const AccountSidebar = ({ user, onLogout, prestigeRank }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const queryTab = searchParams.get("tabs");
  const activeTab = queryTab || DEFAULT_TAB;
  const prestige = getUserPrestige(user, prestigeRank);
  const isPremium = prestige.isPremium || isPremiumActive(user);
  const premiumSummary = getPremiumSummary(user);

  return (
    <nav
      className={`w-[90%] md:w-[250px] mt-[50px] md:ml-[20px] mx-auto rounded-2xl bg-account-bg-secondary min-h-auto md:min-h-[calc(100dvh-var(--app-header-total-height))] p-6 flex flex-col border-r-0 md:border-r border-b md:border-b-0 border-account-border md:sticky md:top-[var(--app-header-total-height)] md:h-[calc(100dvh-var(--app-header-total-height))] ${
        prestige.hasPrestige ? "shadow-[0_24px_70px_rgba(243,191,26,0.12)]" : ""
      } ${getPrestigeContainerClassName(user, prestigeRank)}`}
    >
      <div className="flex-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <Link
              key={item.tab}
              to={`/account?tabs=${item.tab}`}
              className={`flex items-center px-4 py-3 rounded-lg mb-2 font-medium no-underline transition-all ${
                isActive
                  ? "bg-account-bg-tertiary text-account-accent"
                  : "text-account-text-secondary hover:bg-account-bg-tertiary hover:text-account-text-primary"
              }`}
            >
              <i className={`fas ${item.icon} w-5 text-center mr-3`}></i>
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Premium Link */}
      <Link
        to="/premium"
        className={`flex flex-col px-4 py-3 rounded-lg mb-2 font-medium no-underline transition-all ${
          isPremium
            ? "bg-gradient-to-r from-primaryColor to-hoverPrimaryColor text-black"
            : "bg-primaryColor/20 text-primaryColor hover:bg-primaryColor/30 border border-primaryColor/50"
        }`}
      >
        <div className="flex items-center">
          <i
            className={`fas ${isPremium ? "fa-crown" : "fa-star"} w-5 text-center`}
          ></i>
          <span className={`ml-1 ${isPremium ? "font-bold" : ""}`}>
            {isPremium ? "Premium" : "Nâng cấp Premium"}
          </span>
        </div>
        {isPremium && (
          <span className="text-xs mt-1 opacity-90">
            {premiumSummary.isActive ? premiumSummary.compactText : "Premium"}
            {premiumSummary.expiresAtLabel ? ` • ${premiumSummary.expiresAtLabel}` : ""}
          </span>
        )}
      </Link>

      <div className="mt-auto border-t border-account-border pt-5">
        <div className="md:flex items-center mb-4 hidden">
          <PremiumAvatar
            src={user.avatar}
            alt={user.username}
            size="w-10 h-10"
            isPremium={isPremium}
            rank={prestigeRank}
            className="mr-3"
          />
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold whitespace-nowrap overflow-hidden text-ellipsis ${
                  isPremium ? "text-primaryColor" : "text-account-text-primary"
                }`}
              >
                {user.username}
              </span>
              {isPremium && (
                <i
                  className="fa-solid fa-crown text-primaryColor text-xs"
                  style={{ filter: "drop-shadow(0 0 3px rgb(var(--ui-primary)/0.6))" }}
                />
              )}
            </div>
            {prestige.isTopRank && (
              <div
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${prestige.topRankTier.badgeClassName}`}
              >
                <i className={`fa-solid ${prestige.topRankTier.icon}`} />
                {prestige.topRankTier.shortTitle}
              </div>
            )}
            <div className="text-xs text-account-text-secondary whitespace-nowrap overflow-hidden text-ellipsis">
              {user.email.length > 15 ? user.email.substring(0, 15) + "..." : user.email}
            </div>
            {user.coin !== undefined && (
              <div className="text-xs text-primaryColor mt-1 flex items-center gap-1">
                <i className="fa-solid fa-coins"></i>
                {user.coin.toLocaleString()} coin
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex pl-5 md:pl-1 items-center text-account-text-secondary bg-transparent border-none py-2.5 font-medium cursor-pointer w-full text-sm transition-colors hover:text-[#ff6b6b]"
        >
          <i className="fas fa-sign-out-alt mr-3"></i> Thoát
        </button>
      </div>
    </nav>
  );
};

export default AccountSidebar;
