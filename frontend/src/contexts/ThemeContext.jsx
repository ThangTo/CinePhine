import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import apiRequest from "services/utils/apiRequest";

/**
 * ThemeContext - Provides theme state and methods throughout the app
 */
const ThemeContext = createContext(null);

/**
 * Theme definitions
 */
export const themes = {
  default: {
    name: "default",
    displayName: "Mặc định",
    colors: {
      primary: "#f97316", // Orange
      primaryHover: "#ea580c",
      background: "#000000",
      surface: "#111827",
      text: "#ffffff",
      textSecondary: "#9ca3af",
      border: "#374151",
      accent: "#6366f1",
    },
    decorations: {
      enabled: false,
      particles: false,
      animations: false,
    },
  },
  tet: {
    name: "tet",
    displayName: "Tết Nguyên Đán",
    colors: {
      primary: "#dc2626", // Red - màu đỏ may mắn
      primaryHover: "#b91c1c",
      background: "#0a0a0a", // Dark background với hint đỏ
      surface: "#1a0a0a", // Surface với hint đỏ
      text: "#ffffff",
      textSecondary: "#fca5a5", // Light red cho text phụ
      border: "#7f1d1d", // Dark red border
      accent: "#fbbf24", // Gold - màu vàng may mắn
    },
    decorations: {
      enabled: true,
      particles: true,
      animations: true,
      // CSS classes cho decorations
      backgroundPattern: "tet-background",
      particleEffect: "tet-particles",
      glowEffect: "tet-glow",
    },
    // Assets cho Tết
    assets: {
      flowers: true, // Hoa đào
      firecrackers: true, // Pháo
      lanterns: true, // Lồng đèn
      goldCoins: true, // Tiền vàng
    },
  },
  christmas: {
    name: "christmas",
    displayName: "Giáng Sinh",
    colors: {
      primary: "#dfc38b", // Champagne
      primaryHover: "#f1dbad",
      background: "#10191a",
      surface: "#192724",
      text: "#ffffff",
      textSecondary: "#c3cdc5",
      border: "#34483f",
      accent: "#577b66", // Evergreen
    },
    decorations: {
      enabled: true,
      particles: true,
      animations: true,
      backgroundPattern: "christmas-background",
      particleEffect: "christmas-particles",
      glowEffect: "christmas-glow",
    },
    assets: {
      snowflakes: true,
      stars: true,
      bells: true,
    },
  },
  newyear: {
    name: "newyear",
    displayName: "Năm Mới",
    colors: {
      primary: "#fbbf24", // Gold
      primaryHover: "#f59e0b",
      background: "#000000",
      surface: "#1a1a1a",
      text: "#ffffff",
      textSecondary: "#fbbf24",
      border: "#374151",
      accent: "#ec4899", // Pink
    },
    decorations: {
      enabled: true,
      particles: true,
      animations: true,
      backgroundPattern: "newyear-background",
      particleEffect: "newyear-particles",
      glowEffect: "newyear-glow",
    },
    assets: {
      confetti: true,
      sparkles: true,
      fireworks: true,
    },
  },
};

/**
 * Auto-detect theme based on current date
 */
export const detectThemeByDate = () => {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Tết Nguyên Đán (thường vào tháng 1-2, nhưng ngày chính xác thay đổi theo lịch âm)
  // Ước tính: khoảng 20/1 - 20/2 (có thể điều chỉnh)
  if ((month === 1 && day >= 20) || (month === 2 && day <= 20)) {
    return "tet";
  }

  // Giáng Sinh: 1-31/12
  if (month === 12) {
    return "christmas";
  }

  // Năm Mới: 1-7/1
  if (month === 1 && day <= 7) {
    return "newyear";
  }

  return "default";
};

/**
 * ThemeProvider - Wraps the app and provides theme context
 */
export const ThemeProvider = ({ children }) => {
  const previewTheme = process.env.NODE_ENV === "development"
    ? new URLSearchParams(window.location.search).get("themePreview")
    : null;
  const [serverTheme, setServerTheme] = useState("default"); // Theme từ server (không thay đổi khi toggle)
  const [isThemeEnabled, setIsThemeEnabled] = useState(() => {
    // Load from localStorage, default to true
    const saved = localStorage.getItem("themeEnabled");
    return saved === null ? true : saved === "true";
  });
  const [loading, setLoading] = useState(true);
  const themeRevision = useRef(0);

  const applySavedTheme = useCallback((themeName) => {
    if (!Object.prototype.hasOwnProperty.call(themes, themeName)) return;
    themeRevision.current += 1;
    setServerTheme(themeName);
  }, []);

  // Load theme from server on mount
  useEffect(() => {
    if (previewTheme && Object.prototype.hasOwnProperty.call(themes, previewTheme)) {
      setServerTheme(previewTheme);
      setLoading(false);
      return undefined;
    }
    const loadTheme = async () => {
      const revision = themeRevision.current;
      try {
        // Try to load theme from server (public endpoint)
        const response = await apiRequest("/movies/meta/theme", {
          requiresAuth: false, // Public endpoint
        });
        const theme = response.theme || response.data?.theme;
        if (revision === themeRevision.current && theme && themes[theme]) {
          setServerTheme(theme);
        }
      } catch (error) {
        console.warn("Failed to load theme from server, using default:", error);
        // Fallback to default if server fails
        if (revision === themeRevision.current) setServerTheme("default");
      } finally {
        setLoading(false);
      }
    };

    loadTheme();

    // Poll for theme changes every 5 minutes
    const interval = setInterval(loadTheme, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [previewTheme]);

  // Toggle theme on/off
  const toggleTheme = useCallback(() => {
    const newState = !isThemeEnabled;
    setIsThemeEnabled(newState);
    localStorage.setItem("themeEnabled", newState.toString());
  }, [isThemeEnabled]);

  // Theme được áp dụng (có thể là default nếu isThemeEnabled = false)
  const currentTheme = isThemeEnabled ? serverTheme : "default";
  const theme = themes[currentTheme] || themes.default;
  const allThemes = themes;

  const value = {
    theme,
    currentTheme,
    serverTheme, // Theme từ server (để kiểm tra có hiển thị nút hay không)
    isThemeEnabled,
    toggleTheme,
    applySavedTheme,
    allThemes,
    loading,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * useTheme hook - Access theme context
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};

export default ThemeContext;
