import React, { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AccountSidebar from "components/account/AccountSidebar";
import ProfileCard from "components/account/ProfileCard";
import AccountInfoCard from "components/account/AccountInfoCard";
import SecurityCard from "components/account/SecurityCard";
import NotificationsTab from "components/notifications/NotificationsTab";
import { useNotifications } from "contexts/NotificationContext";
import useAuth from "hooks/useAuth";
import userService from "services/user.service";
import { PageSpinner } from "components/common/LoadingState";
import ContinueWatchingSection from "components/account/ContinueWatchingSection";
import FavoritesSection from "components/account/FavoritesSection";
import WatchlistSection from "components/account/WatchlistSection";
import WatchStreak from "components/common/WatchStreak";
import CursorEffectShop from "components/account/CursorEffectShop";
import QuestPage from "components/account/QuestPage";
import CoinHistoryTab from "components/account/CoinHistoryTab";
import PremiumAvatar from "components/common/PremiumAvatar";
import { getPremiumSummary } from "utils/premiumUtils";
import useCurrentUserPrestige from "hooks/useCurrentUserPrestige";

const DEFAULT_TAB = "profile";

const MOBILE_ACCOUNT_NAV_ITEMS = [
  { tab: "profile", icon: "fa-user", label: "Hồ sơ", accent: "text-account-text-primary" },
  { tab: "notifications", icon: "fa-bell", label: "Thông báo", accent: "text-primaryColor" },
  { tab: "quests", icon: "fa-trophy", label: "Nhiệm vụ", accent: "text-primaryColor" },
  {
    tab: "continue-watching",
    icon: "fa-play",
    label: "Xem tiếp",
    accent: "text-account-text-primary",
  },
  { tab: "favorites", icon: "fa-heart", label: "Yêu thích", accent: "text-account-text-primary" },
  { tab: "watchlist", icon: "fa-list", label: "Danh sách", accent: "text-account-text-primary" },
  { tab: "streak", icon: "fa-fire", label: "Chuỗi xem", accent: "text-primaryColor" },
  {
    tab: "effects",
    icon: "fa-wand-magic-sparkles",
    label: "Hiệu ứng",
    accent: "text-primaryColor",
  },
  {
    tab: "coin-history",
    icon: "fa-receipt",
    label: "Lịch sử coin",
    accent: "text-primaryColor",
  },
];

const TAB_TITLES = {
  profile: "Quản lý tài khoản",
  favorites: "Danh sách yêu thích",
  watchlist: "Danh sách của bạn",
  notifications: "Thông báo",
  "continue-watching": "Xem tiếp của bạn",
  streak: "Chuỗi xem",
  effects: "Hiệu ứng",
  quests: "Nhiệm vụ",
  "coin-history": "Lịch sử coin",
};

const AccountPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, updateUser, logout } = useAuth();
  const { setActiveNotificationId } = useNotifications();
  const {
    leaderboardRank,
    displayUser: prestigeUser,
    prestige: userPrestige,
    isPremium: displayPremiumActive,
  } = useCurrentUserPrestige(user);
  const searchParams = new URLSearchParams(location.search);
  const queryTab = searchParams.get("tabs");
  const activeTab = queryTab || DEFAULT_TAB;

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (location.pathname === "/account" && !queryTab) {
      navigate(`/account?tabs=${DEFAULT_TAB}`, { replace: true });
    }
  }, [location.pathname, queryTab, navigate]);

  useEffect(() => {
    if (activeTab !== "notifications") {
      setActiveNotificationId(null);
    }
  }, [activeTab, setActiveNotificationId]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleUpdateProfile = async (updatedData) => {
    try {
      const updatedUser = await userService.updateProfile(updatedData);
      updateUser(updatedUser);
      return updatedUser;
    } catch (error) {
      console.error("Error updating profile:", error);
      if (!(updatedData instanceof FormData)) {
        const updatedUser = { ...user, ...updatedData };
        updateUser(updatedUser);
        return updatedUser;
      }

      throw error;
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-dvh bg-bgColor text-white flex items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  const pageTitle = TAB_TITLES[activeTab] || TAB_TITLES[DEFAULT_TAB];
  const activeMobileItem =
    MOBILE_ACCOUNT_NAV_ITEMS.find((item) => item.tab === activeTab) || MOBILE_ACCOUNT_NAV_ITEMS[0];
  const premiumSummary = getPremiumSummary(user);
  const mobileStatusText = premiumSummary.isActive
    ? premiumSummary.compactText
    : displayPremiumActive
      ? "Premium"
      : "Thành viên thường";

  const getMobileTabLabel = (item) => (item?.tab === "coin-history" ? "Lịch sử coin" : item?.label);

  const renderMainContent = () => {
    if (activeTab === "continue-watching") {
      return <ContinueWatchingSection user={user} />;
    }

    if (activeTab === "favorites") {
      return <FavoritesSection user={user} />;
    }

    if (activeTab === "watchlist") {
      return <WatchlistSection user={user} />;
    }

    if (activeTab === "notifications") {
      return <NotificationsTab />;
    }

    if (activeTab === "streak") {
      return <WatchStreak />;
    }

    if (activeTab === "effects") {
      return <CursorEffectShop />;
    }

    if (activeTab === "coin-history") {
      return <CoinHistoryTab />;
    }

    if (activeTab === "quests") {
      return <QuestPage onCoinUpdate={(newBalance) => updateUser({ ...user, coin: newBalance })} />;
    }

    return (
      <>
        <ProfileCard user={prestigeUser} onUpdate={handleUpdateProfile} prestigeRank={leaderboardRank} />
        <AccountInfoCard user={user} onUpdate={handleUpdateProfile} />
        <SecurityCard user={user} onUpdate={handleUpdateProfile} />
      </>
    );
  };

  const mainContent = renderMainContent();

  return (
    <div className="min-h-dvh bg-account-bg-primary text-account-text-primary">
      <div className="min-h-dvh mx-auto md:flex md:py-[50px]">
        <div className="hidden md:block">
          <AccountSidebar user={prestigeUser} onLogout={handleLogout} prestigeRank={leaderboardRank} />
        </div>

        <main className="flex-1 px-4 pb-10 pt-[calc(var(--app-header-total-height)+1rem)] md:mt-[40px] md:p-10 md:pt-2 box-border">
          <div className="md:hidden space-y-4">
            <section className="relative overflow-hidden rounded-[28px] border border-account-border/80 bg-account-bg-secondary px-4 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-20 rounded-full bg-primaryColor/12 blur-3xl" />
              <div className="pointer-events-none absolute -right-10 top-12 h-28 w-28 rounded-full bg-white/5 blur-3xl" />

              <div className="relative flex items-start gap-4">
                <PremiumAvatar
                  src={user.avatar}
                  alt={user.username}
                  size="w-16 h-16"
                  isPremium={displayPremiumActive}
                  rank={leaderboardRank}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-xl font-semibold text-account-text-primary">
                      {user.username}
                    </h1>
                    {displayPremiumActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primaryColor/15 px-2 py-1 text-[11px] font-semibold text-primaryColor">
                        <i className="fa-solid fa-crown text-[10px]" />
                        Premium
                      </span>
                    )}
                    {userPrestige.isTopRank && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${userPrestige.topRankTier.badgeClassName}`}
                      >
                        <i className={`fa-solid ${userPrestige.topRankTier.icon} text-[10px]`} />
                        {userPrestige.topRankTier.shortTitle}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-account-text-secondary">{user.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-account-bg-primary/70 px-3 py-1.5 text-xs font-semibold text-account-text-primary ring-1 ring-account-border/80">
                      <i className="fa-solid fa-coins text-primaryColor" />
                      {(user.coin || 0).toLocaleString("vi-VN")} coin
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-account-bg-primary/70 px-3 py-1.5 text-xs font-medium text-account-text-secondary ring-1 ring-account-border/80">
                      <i
                        className={`fa-solid ${
                          displayPremiumActive ? "fa-bolt" : "fa-user"
                        } text-primaryColor`}
                      />
                      {mobileStatusText}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-account-border bg-account-bg-primary/70 text-account-text-secondary transition-colors hover:text-[#ff6b6b]"
                  aria-label="Đăng xuất"
                >
                  <i className="fas fa-sign-out-alt" />
                </button>
              </div>

              {premiumSummary.isActive && (
                <div className="relative mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-primaryColor/25 bg-primaryColor/10 p-3 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-account-text-secondary">
                      Gói hiện tại
                    </p>
                    <p className="mt-1 font-semibold text-primaryColor">{premiumSummary.title}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-account-text-secondary">
                      Hết hạn
                    </p>
                    <p className="mt-1 font-semibold text-account-text-primary">
                      {premiumSummary.expiresAtLabel}
                    </p>
                  </div>
                </div>
              )}

              <div className="relative mt-4 grid grid-cols-2 gap-2">
                <Link
                  to="/recharge"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-account-bg-primary/70 px-4 py-3 text-sm font-semibold text-account-text-primary ring-1 ring-account-border transition-colors hover:bg-account-bg-tertiary"
                >
                  <i className="fa-solid fa-wallet text-primaryColor" />
                  Nạp coin
                </Link>
                <Link
                  to="/premium"
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                    displayPremiumActive
                      ? "bg-primaryColor text-black"
                      : "bg-primaryColor/15 text-primaryColor ring-1 ring-primaryColor/40"
                  }`}
                >
                  <i className={`fa-solid ${displayPremiumActive ? "fa-crown" : "fa-star"}`} />
                  {displayPremiumActive ? "Premium" : "Mở Premium"}
                </Link>
              </div>
            </section>

            <section className="sticky top-[calc(var(--app-header-total-height)+0.5rem)] z-20">
              <div className="rounded-[24px] border border-account-border/80 bg-account-bg-secondary/95 p-2 shadow-[0_20px_45px_rgba(0,0,0,0.18)] backdrop-blur">
                <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                  {MOBILE_ACCOUNT_NAV_ITEMS.map((item) => {
                    const isActive = activeTab === item.tab;

                    return (
                      <button
                        key={item.tab}
                        onClick={() => navigate(`/account?tabs=${item.tab}`)}
                        className={`shrink-0 rounded-[20px] border px-3 py-3 text-left transition-all ${
                          isActive
                            ? "border-primaryColor bg-primaryColor text-black shadow-[0_12px_28px_rgba(243,191,26,0.28)]"
                            : "border-account-border bg-account-bg-primary/65 text-account-text-secondary"
                        }`}
                      >
                        <div className="flex min-w-[90px] items-center gap-3">
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                              isActive
                                ? "bg-black/10 text-black"
                                : "bg-account-bg-tertiary text-primaryColor"
                            }`}
                          >
                            <i className={`fas ${item.icon} text-sm`} />
                          </span>
                          <div className="min-w-0">
                            <p
                              className={`truncate text-sm font-semibold ${
                                isActive ? "text-black" : item.accent
                              }`}
                            >
                              {getMobileTabLabel(item)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-[28px] border border-account-border/80 bg-account-bg-secondary p-4 shadow-[0_24px_60px_rgba(0,0,0,0.18)] md:mt-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <div className="hidden md:block">
              <h1 className="mb-8 text-3xl font-bold">{pageTitle}</h1>
            </div>

            <div className="mb-5 flex items-center justify-between gap-3 md:hidden">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-account-text-secondary/75">
                  Account
                </p>
                <h2 className="mt-1 text-xl font-semibold text-account-text-primary">
                  {getMobileTabLabel(activeMobileItem)}
                </h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-account-bg-primary/75 text-primaryColor ring-1 ring-account-border">
                <i className={`fas ${activeMobileItem.icon}`} />
              </div>
            </div>

            {mainContent}
          </section>
        </main>
      </div>
    </div>
  );
};

export default AccountPage;
