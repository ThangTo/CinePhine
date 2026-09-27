/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Noto Sans",
          "Liberation Sans",
          "Arial",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
      colors: {
        bgColor: "#191b24",
        bgColor2: "#282B3A",
        bgColor3: "#ffffff10",
        bgColor4: "#10121b",
        primaryColor: "rgb(var(--ui-primary, 255 216 117) / <alpha-value>)",
        hoverPrimaryColor: "rgb(var(--ui-primary-hover, 253 230 138) / <alpha-value>)",
        hoverLinkColor: "#22d3ee",
        primaryColorButtonText: "rgb(var(--ui-on-primary, 25 27 36) / <alpha-value>)",

        borderColor: "#ffffff10",
        account: {
          bg: {
            primary: "#121212",
            secondary: "#1e1e1e",
            tertiary: "#2a2a2a",
          },
          text: {
            primary: "#e0e0e0",
            secondary: "#a0a0a0",
          },
          accent: "#f3bf1a",
          border: "#333333",
        },
      },
      animation: {
        spin: "spin 1s linear infinite",
        "modal-slide-in": "modalSlideIn 0.3s ease-out",
        fadeIn: "fadeIn 0.2s ease-out",
        "pop-up": "popUp 0.4s ease forwards",
        slideDown: "slideDown 0.3s ease-out",
        ripple: "ripple 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
        "fade-in-up": "fadeInUp 0.25s ease-out forwards",
        "premium-glow": "premiumGlow 2.5s ease-in-out infinite",
        "premium-shimmer": "premiumShimmer 3s ease-in-out infinite",
        "crown-float": "crownFloat 3s ease-in-out infinite",
        "premium-pulse": "premiumPulse 2s ease-in-out infinite",
        wiggle: "wiggle 0.5s ease-in-out",
        streakCardIn: "streakCardIn 0.25s ease-out forwards",
      },
      keyframes: {
        spin: {
          to: { transform: "rotate(360deg)" },
        },
        modalSlideIn: {
          from: {
            opacity: "0",
            transform: "translateY(-20px)",
          },
          to: {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        fadeIn: {
          from: {
            opacity: "0",
            transform: "scale(0.95) translateY(-10px)",
          },
          to: {
            opacity: "1",
            transform: "scale(1) translateY(0)",
          },
        },
        popUp: {
          "0%": {
            transform: "scale(0.5)",
            opacity: "0",
          },
          "60%": {
            transform: "scale(1.005)",
            opacity: "1",
          },
          "100%": {
            transform: "scale(1)",
          },
        },
        slideDown: {
          "0%": {
            opacity: "0",
            transform: "translateY(-20px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.4" },
          "50%": { opacity: "0.2" },
          "100%": { transform: "scale(3)", opacity: "0" },
        },
        fadeInUp: {
          "0%": { transform: "translateY(8px) scale(0.95)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        premiumGlow: {
          "0%, 100%": { boxShadow: "0 0 8px 2px rgba(255, 216, 117, 0.4)" },
          "50%": { boxShadow: "0 0 20px 6px rgba(255, 216, 117, 0.7)" },
        },
        premiumShimmer: {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        crownFloat: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        premiumPulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(-8deg)" },
          "75%": { transform: "rotate(8deg)" },
        },
        streakCardIn: {
          "0%": { opacity: "0", transform: "scale(0.92) translateY(-8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      screens: {
        "3xl": "1920px",
        "laptop-sm": { min: "1024px", max: "1207px" },
        "laptop-xs": { min: "1024px", max: "1081px" },
      },
      textColor: {
        primaryColor: "rgb(var(--ui-primary-text, 255 216 117) / <alpha-value>)",
        hoverPrimaryColor: "rgb(var(--ui-primary-text, 253 230 138) / <alpha-value>)",
      },
      borderColor: {
        primaryColor: "rgb(var(--ui-primary-text, 255 216 117) / <alpha-value>)",
      },
      ringColor: {
        primaryColor: "rgb(var(--ui-primary-text, 255 216 117) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
