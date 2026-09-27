import React, { Suspense, lazy, useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MobileUserMenu,
  DesktopUserMenu,
  NavigationLinks,
  SearchBar,
} from "components/header/index";
import { useNotifications } from "contexts/NotificationContext";
import useAuth from "hooks/useAuth";
import ThemeSelector from "components/common/ThemeSelector";
import TimiToggle from "components/common/TimiToggle";
import WatchStreak from "components/common/WatchStreak";
import PwaInstallButton from "components/pwa/PwaInstallButton";
import useCurrentUserPrestige from "hooks/useCurrentUserPrestige";
import logo2Trans from "assets/images/logo2_trans.png";

const NotificationPanel = lazy(() => import("components/notifications/NotificationPanel"));

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileNotifications, setShowMobileNotifications] = useState(false);
  const menuRef = useRef(null);
  const mobileBellButtonRef = useRef(null);
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, openAuthModal, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const {
    leaderboardRank,
    displayUser: prestigeUser,
    prestige: userPrestige,
  } = useCurrentUserPrestige(isAuthenticated ? user : null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showUserMenu]);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate("/");
  };

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[100001] bg-black pt-safe transition-colors duration-300 ${
          scrolled ? "md:bg-black/80 md:backdrop-blur" : "md:bg-transparent"
        }`}
      >
        <nav
          className="w-full py-2 lg:py-3 flex items-center gap-3"
          style={{
            paddingLeft: "calc(0.5rem + var(--safe-left))",
            paddingRight: "calc(0.5rem + var(--safe-right))",
          }}
        >
          {/* Mobile Menu Button */}
          <button
            onClick={() => {
              setShowMobileMenu(!showMobileMenu);
              setShowMobileSearch(false);
            }}
            className="relative rounded-lg p-2 text-white transition-colors hover:bg-white/10 lg:hidden"
            aria-label="Toggle menu"
          >
            <i
              className={`fa-solid ${showMobileMenu ? "fa-times text-red-400" : "fa-bars"} text-xl`}
            />
            {userPrestige?.isTopRank && (
              <span
                className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-black ring-2 ring-black ${userPrestige.topRankTier.badgeClassName}`}
              >
                #{userPrestige.topRankTier.rank}
              </span>
            )}
          </button>

          {/* Left: Logo */}
          <Link
            to="/"
            className="relative h-9 w-32 shrink-0 overflow-hidden rounded-sm sm:w-36 lg:h-10 lg:w-40"
            data-theme-glow="true"
            aria-label="CinePhine"
          >
            <img
              src={logo2Trans}
              alt="CinePhine"
              className="site-header-logo absolute left-1/2 top-1/2 h-[255%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
              draggable={false}
            />
          </Link>

          {/* Middle: Nav links (desktop) */}
          <NavigationLinks className="hidden lg:flex items-center gap-5 text-sm" isMobile={false} />

          {/* Right: Search + actions */}
          <div className="ml-auto flex items-center gap-2 laptop-sm:gap-1">
            {/* Timi Toggle - Desktop */}
            <div className="hidden lg:block">
              <TimiToggle />
            </div>
            {/* Watch Streak - Desktop */}
            <div className="hidden lg:block">
              <WatchStreak compact />
            </div>
            {/* Theme Selector - Desktop */}
            <div className="hidden lg:block">
              <ThemeSelector />
            </div>
            <div className="hidden lg:block">
              <PwaInstallButton />
            </div>
            {!isLoading && isAuthenticated ? (
              <div className="lg:hidden relative">
                <button
                  ref={mobileBellButtonRef}
                  onClick={() => {
                    setShowMobileNotifications(!showMobileNotifications);
                    setShowMobileMenu(false);
                    setShowMobileSearch(false);
                  }}
                  className="relative p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Notifications"
                >
                  <i className="fa-solid fa-bell text-xl" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
                {showMobileNotifications && (
                  <>
                    {/* Backdrop cho mobile */}
                    <div
                      className="fixed inset-0 bg-black/50 z-[100001] md:hidden"
                      onClick={() => setShowMobileNotifications(false)}
                    />
                    <div className="fixed inset-0 top-[var(--app-header-total-height)] z-[100002] px-2 py-2 md:absolute md:inset-auto md:right-0 md:top-full md:z-50 md:mt-2">
                      <Suspense fallback={null}>
                        <NotificationPanel
                          onClose={() => setShowMobileNotifications(false)}
                          triggerRef={mobileBellButtonRef}
                        />
                      </Suspense>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {/* Mobile Search Button */}
            <button
              onClick={() => {
                setShowMobileSearch(!showMobileSearch);
                setShowMobileMenu(false);
              }}
              className="lg:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Toggle search"
            >
              <i
                className={`fa-solid ${
                  showMobileSearch ? "fa-times text-red-400" : "fa-search text-white"
                } text-xl`}
              />
            </button>
            {/* Desktop Search */}
            <SearchBar className="hidden lg:block laptop-sm:w-60 laptop-xs:w-44 xl:w-80" />
            {isAuthenticated ? (
              <DesktopUserMenu
                user={prestigeUser || user}
                prestigeRank={leaderboardRank}
                prestige={userPrestige}
                showUserMenu={showUserMenu}
                onToggle={() => setShowUserMenu(!showUserMenu)}
                onLogout={handleLogout}
                menuRef={menuRef}
              />
            ) : !isLoading ? (
              <button
                onClick={() => openAuthModal("login")}
                className="hidden sm:hidden md:hidden lg:inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primaryColor to-hoverPrimaryColor hover:from-hoverPrimaryColor hover:to-primaryColor text-primaryColorButtonText font-semibold px-5 laptop-xs:px-4 py-2 text-sm transition-all shadow-lg shadow-primaryColor/30"
              >
                <i className="fa-solid fa-user" />
                <span>Đăng nhập</span>
              </button>
            ) : null}
          </div>
        </nav>
      </header>

      {/* Mobile Search Overlay */}
      {showMobileSearch && (
        <div className="fixed left-0 right-0 top-[var(--app-header-total-height)] z-40 bg-transparent px-4 py-2 lg:hidden">
          <SearchBar placeholder="Tìm kiếm phim, diễn viên" />
        </div>
      )}

      {/* Mobile Navigation Menu */}
      {showMobileMenu && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className="fixed left-2 right-2 top-[calc(var(--app-header-total-height)+0.375rem)] z-40 max-h-[calc(100dvh-var(--app-header-total-height)-var(--safe-bottom)-1rem)] overflow-y-auto overscroll-contain rounded-2xl bg-[rgba(59,73,135,0.98)] shadow-[0_24px_70px_rgba(0,0,0,0.32)] lg:hidden sm:right-auto sm:w-[390px] md:mx-4">
            <div className="w-full bg-transparent px-3 py-3 sm:px-4 sm:py-4">
              <MobileUserMenu
                user={isAuthenticated ? prestigeUser || user : null}
                prestigeRank={leaderboardRank}
                prestige={userPrestige}
                onLogout={handleLogout}
                onOpenAuth={openAuthModal}
                onClose={() => setShowMobileMenu(false)}
              />

              {/* Theme Selector - Mobile */}
              <div className="lg:hidden hidden mt-4 mb-4 items-center justify-between px-2">
                <span className="text-sm text-gray-300">Theme</span>
                <ThemeSelector />
              </div>

              {/* Timi Toggle - Mobile */}
              <div className="lg:hidden mb-4 flex items-center justify-between px-2">
                {/* <span className="text-sm text-gray-300">Trợ lý Timi</span> */}
                <div className="lg:hidden">
                  <WatchStreak compact />
                </div>
                <TimiToggle />
              </div>

              {/* Watch Streak - Mobile */}

              <NavigationLinks isMobile={true} />
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Header;
