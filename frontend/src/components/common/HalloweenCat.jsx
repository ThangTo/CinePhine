import React, { useEffect, useRef } from "react";

/**
 * Points pupils toward the mouse by setting --look-x/--look-y on each element.
 * @param {() => Array<Element|null>} getElements
 * @param {(element: Element, distance: number) => void} [onDistance]
 * @returns {() => void} cleanup
 */
export function followPointer(getElements, onDistance) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = null;
  let point = null;
  const update = () => {
    frame = null;
    // Read every rect before the first write: interleaving forces a layout per element.
    const measured = getElements().map((element) => [element, element?.getBoundingClientRect()]);
    for (const [element, rect] of measured) {
      if (!rect?.width) continue;
      const dx = point.x - rect.left - rect.width / 2;
      const dy = point.y - rect.top - rect.height / 2;
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, distance / 240) * 2.4 / distance;
      element.style.setProperty("--look-x", `${(dx * reach).toFixed(2)}px`);
      element.style.setProperty("--look-y", `${(dy * reach).toFixed(2)}px`);
      onDistance?.(element, distance);
    }
  };
  const onMove = (event) => {
    if (event.pointerType !== "mouse" || reduced.matches || document.hidden) return;
    point = { x: event.clientX, y: event.clientY };
    if (frame === null) frame = requestAnimationFrame(update);
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    window.removeEventListener("pointermove", onMove);
    if (frame !== null) cancelAnimationFrame(frame);
  };
}

export default function HalloweenCat() {
  const eyesRef = useRef(null);
  useEffect(() => followPointer(() => [eyesRef.current]), []);

  return (
    <svg className="halloween-cat" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path className="halloween-cat-tail" d="M64 88Q88 90 86 68Q85 58 92 52" stroke="#17111c" strokeWidth="7" strokeLinecap="round" />
      <path d="M30 94Q26 64 42 52H58Q74 64 70 94Z" fill="#17111c" />
      <ellipse cx="42" cy="93" rx="6" ry="3.5" fill="#241a2c" />
      <ellipse cx="58" cy="93" rx="6" ry="3.5" fill="#241a2c" />
      <path d="M31 34L33 13L46 24ZM69 34L67 13L54 24Z" fill="#17111c" />
      <path d="M35 28L35.5 19L42 24.5ZM65 28L64.5 19L58 24.5Z" fill="#5a3a52" />
      <ellipse cx="50" cy="38" rx="21" ry="17.5" fill="#17111c" />
      <g ref={eyesRef}>
        <g className="halloween-cat-blink">
          <ellipse cx="42" cy="37" rx="6" ry="6.5" fill="#ffa63d" />
          <ellipse cx="58" cy="37" rx="6" ry="6.5" fill="#ffa63d" />
          <g className="halloween-cat-pupils" fill="#1f0e04">
            <ellipse cx="42" cy="37" rx="1.8" ry="4.6" />
            <ellipse cx="58" cy="37" rx="1.8" ry="4.6" />
          </g>
          <circle cx="43.8" cy="34.4" r="1.3" fill="#fff" />
          <circle cx="59.8" cy="34.4" r="1.3" fill="#fff" />
        </g>
      </g>
      <path d="M48.3 44.5h3.4L50 46.6Z" fill="#ff9fb0" />
      <path d="M46 48.5Q48 50.5 50 48.5Q52 50.5 54 48.5" stroke="#c9b8a8" strokeWidth="1" strokeLinecap="round" />
      <path d="M37 45L26 43M37 47.5L27 49M63 45L74 43M63 47.5L73 49" stroke="#c9b8a8" strokeWidth=".8" opacity=".5" />
      <path d="M38 55Q50 61 62 55" stroke="#ff7a1a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="60.5" r="3.6" fill="#ff7a1a" />
      <path d="M50 57v-2" stroke="#5c7a2c" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
