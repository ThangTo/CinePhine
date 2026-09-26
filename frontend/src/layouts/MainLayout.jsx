import { Suspense, lazy, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useTheme } from "contexts/ThemeContext";
import Header from "components/general/Header";
import SiteFooter from "components/general/SiteFooter";
// import GuestNotification from "components/general/GuestNotification";
import { hexToRgbChannels } from "utils/colorUtils";

const Chatbot = lazy(() => import("components/general/Chatbot"));
const ThemeDecorations = lazy(() => import("components/common/ThemeDecorations"));
const ChristmasDecorations = lazy(() => import("components/common/ChristmasDecorations"));
const MailboxFAB = lazy(() => import("components/general/MailboxFAB"));

function useDeferredMount(timeout = 2500) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsReady(true);
      return undefined;
    }

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => setIsReady(true), { timeout });
      return () => {
        if ("cancelIdleCallback" in window) {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timerId = window.setTimeout(() => setIsReady(true), 1200);
    return () => window.clearTimeout(timerId);
  }, [timeout]);

  return isReady;
}

function DeferredLayoutWidgets({ theme, currentTheme }) {
  const isReady = useDeferredMount();

  if (!isReady) return null;

  return (
    <Suspense fallback={null}>
      {theme.decorations.enabled && (currentTheme === "christmas"
        ? <ChristmasDecorations />
        : <ThemeDecorations theme={currentTheme} />)}
      <Chatbot />
      <MailboxFAB />
    </Suspense>
  );
}

const MainLayout = () => {
  const { theme, currentTheme } = useTheme();
  const primaryRgb = hexToRgbChannels(theme.colors.primary);
  const accentRgb = hexToRgbChannels(theme.colors.accent);
  const surfaceRgb = hexToRgbChannels(theme.colors.surface, "17, 24, 39");

  return (
    <div
      className={`flex flex-col min-h-dvh theme-transition ${
        theme.decorations.enabled && theme.decorations.backgroundPattern
          ? theme.decorations.backgroundPattern
          : ""
      }`}
      data-theme={currentTheme}
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        "--primary-color": theme.colors.primary,
        "--primary-color-hover": theme.colors.primaryHover,
        "--primary-color-dark": theme.colors.accent,
        "--primary-color-rgb": primaryRgb,
        "--theme-background": theme.colors.background,
        "--theme-surface": theme.colors.surface,
        "--theme-surface-rgb": surfaceRgb,
        "--theme-text": theme.colors.text,
        "--theme-border": theme.colors.border,
        "--theme-accent": theme.colors.accent,
        "--theme-accent-rgb": accentRgb,
      }}
    >
      <Header />
      <main className="flex-grow">
        <Outlet />
      </main>
      <SiteFooter />
      <DeferredLayoutWidgets theme={theme} currentTheme={currentTheme} />
      {/* <GuestNotification /> */}
    </div>
  );
};

export default MainLayout;
