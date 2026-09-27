import React, { useContext } from "react";
import ThemeContext from "contexts/ThemeContext";
import SnowmanLoader from "./SnowmanLoader";

export const BarSpinner = ({ message = "Đang xử lý...", className = "" }) => (
  <span role="status" aria-label={message} className={`inline-flex items-center justify-center ${className}`}>
    <span className="loading-bars flex items-center justify-center gap-1.5 h-8" aria-hidden="true">
      {[0, 1, 2].map((i) => <span key={i} className={`w-1.5 ${i === 1 ? "h-8" : "h-6"} bg-primaryColor rounded-full animate-bounce`} style={{ animationDelay: `${-i * .2}s` }} />)}
    </span>
  </span>
);

export const PageSpinner = ({ message = "Đang tải...", className = "" }) => {
  const context = useContext(ThemeContext);
  const snowman = context?.theme.loader === "snowman";
  return snowman ? (
    <div role="status" aria-live="polite" className={`flex flex-col items-center gap-1 ${className}`}>
      <SnowmanLoader showTrail />
      <span className="sr-only">{message}</span>
    </div>
  ) : <BarSpinner message={message} className={className} />;
};

export const InlineSpinner = ({ message = "Đang tải...", className = "" }) => (
  <span role="status" className={`inline-flex items-center justify-center gap-3 text-account-text-primary ${className}`}>
    <span className="loading-ring animate-spin rounded-full h-6 w-6 border-2 border-account-bg-tertiary border-t-primaryColor" aria-hidden="true" />
    {message && <span className="text-sm">{message}</span>}
  </span>
);

export default function LoadingState({ message = "Đang tải...", className = "min-h-dvh bg-[#0a0a0c] text-white" }) {
  return <div className={`flex items-center justify-center ${className}`}><PageSpinner message={message} /></div>;
}
