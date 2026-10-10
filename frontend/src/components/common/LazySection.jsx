import React, { createContext, useContext } from "react";
import useIntersectionObserver from "hooks/useIntersectionObserver";
import { BarSpinner } from "components/common/LoadingState";

// Context to indicate that section is visible (images should load immediately)
const SectionVisibleContext = createContext(false);

export const useSectionVisible = () => useContext(SectionVisibleContext);

/**
 * LazySection Component
 * Only renders children when the section enters the viewport
 * @param {React.ReactNode} children - Content to render when in viewport
 * @param {React.ReactNode} fallback - Loading fallback (default: BarSpinner)
 * @param {string} rootMargin - IntersectionObserver rootMargin (default: '200px')
 * @param {number} minHeight - Minimum height to prevent layout shift (default: '200px')
 */
const LazySection = ({
  children,
  fallback = <BarSpinner className="w-full py-8" />,
  rootMargin = "200px",
  minHeight = "200px",
}) => {
  const [ref, isIntersecting] = useIntersectionObserver({
    rootMargin,
    threshold: 0.01,
    triggerOnce: true,
  });

  return (
    <div ref={ref} style={{ minHeight: isIntersecting ? "auto" : minHeight }}>
      {isIntersecting ? (
        <SectionVisibleContext.Provider value={true}>{children}</SectionVisibleContext.Provider>
      ) : (
        fallback
      )}
    </div>
  );
};

export default LazySection;
