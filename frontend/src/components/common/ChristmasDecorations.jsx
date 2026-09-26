import React, { useEffect, useId, useRef } from "react";
import { useLocation } from "react-router-dom";
import ChristmasCursorTrail from "./ChristmasCursorTrail";

// Deterministic particles keep the scene stable across renders.
const snow = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: `${i % 5 === 0 ? 4 : 2}px`,
  duration: `${18 + (i % 7) * 3}s`,
  delay: `${-((i * 7) % 35)}s`,
  drift: `${(i % 2 ? 1 : -1) * (22 + i * 2)}px`,
}));

function WinterCorner({ side }) {
  const id = useId().replace(/:/g, "");
  const svgRef = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname.startsWith("/watch/")) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ornaments = [...svgRef.current.querySelectorAll(".winter-ornament-core")];
    const nearby = new Set();
    const animations = new Map();
    let lastMove = 0;
    const reactToPointer = (event) => {
      if (event.pointerType !== "mouse" || reduced.matches || document.hidden || document.fullscreenElement) return;
      const click = event.type === "pointerdown";
      if (click && event.button !== 0) return;
      if (!click && performance.now() - lastMove < 70) return;
      lastMove = performance.now();
      for (const ornament of ornaments) {
        const rect = ornament.getBoundingClientRect();
        const distance = Math.hypot(event.clientX - rect.x - rect.width / 2, event.clientY - rect.y - rect.height / 2);
        const hit = distance < rect.width / 2 + (click ? 0 : 24);
        if (!hit) { nearby.delete(ornament); continue; }
        if (!click && nearby.has(ornament)) continue;
        nearby.add(ornament);
        const group = ornament.parentElement;
        animations.get(group)?.cancel();
        const rest = getComputedStyle(group).transform;
        const strength = click ? 14 : 7;
        const direction = side === "left" ? 1 : -1;
        const animation = group.animate([
          { transform: rest },
          { transform: `rotate(${strength * direction}deg)` },
          { transform: `rotate(${-strength * .65 * direction}deg)` },
          { transform: `rotate(${strength * .3 * direction}deg)` },
          { transform: rest },
        ], { duration: click ? 1800 : 1400, easing: "ease-in-out" });
        animations.set(group, animation);
      }
    };
    const clear = () => {
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      nearby.clear();
    };
    window.addEventListener("pointermove", reactToPointer, { passive: true });
    window.addEventListener("pointerdown", reactToPointer, { passive: true });
    reduced.addEventListener("change", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("pointermove", reactToPointer);
      window.removeEventListener("pointerdown", reactToPointer);
      reduced.removeEventListener("change", clear);
      document.removeEventListener("visibilitychange", clear);
      clear();
    };
  }, [pathname, side]);

  return (
    <svg ref={svgRef} className={`winter-corner winter-corner--${side}`} viewBox="0 0 300 340" fill="none">
      <defs>
        <linearGradient id={`${id}-pine`} x1="0" y1="0" x2="150" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#71967a" /><stop offset="0.5" stopColor="#244b3d" /><stop offset="1" stopColor="#102d27" />
        </linearGradient>
        <radialGradient id={`${id}-gold`} cx="0.3" cy="0.23" r="0.8">
          <stop stopColor="#fff4d4" /><stop offset="0.3" stopColor="#d8b777" /><stop offset="0.75" stopColor="#8d602e" /><stop offset="1" stopColor="#493521" />
        </radialGradient>
        <radialGradient id={`${id}-red`} cx="0.3" cy="0.2" r="0.9">
          <stop stopColor="#d68d82" /><stop offset="0.25" stopColor="#9e343e" /><stop offset="0.75" stopColor="#501a2a" /><stop offset="1" stopColor="#281321" />
        </radialGradient>
        <g id={`${id}-sprig`}>
          <path d="M0 0 Q46 -12 105 0" stroke="#6b7550" strokeWidth="2" />
          {Array.from({ length: 13 }, (_, i) => (
            <path key={i} d={`M${i * 7} -2 l${17 - i / 2} -${25 - i} M${i * 7} -1 l${20 - i / 2} ${20 - i}`} stroke={`url(#${id}-pine)`} strokeWidth="2.3" strokeLinecap="round" />
          ))}
        </g>
      </defs>
      <g opacity="0.96">
        <path d="M-20 210 Q22 45 235 -5" stroke="#67513b" strokeWidth="4" />
        {[[-6, 170, -72], [1, 133, -40], [10, 100, -12], [32, 70, 3], [63, 43, 15], [103, 19, 22], [151, 0, 26]].map(([x, y, angle], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
            <use href={`#${id}-sprig`} />
            <use href={`#${id}-sprig`} transform="rotate(-42) scale(.85)" />
            <use href={`#${id}-sprig`} transform="rotate(38) scale(.8)" />
          </g>
        ))}
      </g>
      <g className="winter-pendant winter-pendant--gold">
        <path d="M117 37 V170" stroke="#d8bd81" strokeWidth="1" opacity=".7" />
        <rect x="112" y="166" width="10" height="8" rx="2" fill="#c7a765" />
        <circle className="winter-ornament-core" cx="117" cy="194" r="24" fill={`url(#${id}-gold)`} />
        <path d="M112 172 C100 192 105 208 116 217 M122 172 C134 191 130 208 119 217" stroke="#fff3cf" strokeOpacity=".35" />
        <path d="M95 188 Q116 200 140 188 M96 202 Q117 212 138 202" stroke="#553c23" strokeOpacity=".24" />
        <ellipse cx="108" cy="181" rx="5" ry="3" transform="rotate(-35 108 181)" fill="#fff9e5" opacity=".55" />
      </g>
      <g className="winter-pendant winter-pendant--red">
        <path d="M46 111 V231" stroke="#d8bd81" strokeWidth="1" opacity=".6" />
        <rect x="41" y="227" width="10" height="8" rx="2" fill="#bda16c" />
        <circle className="winter-ornament-core" cx="46" cy="257" r="27" fill={`url(#${id}-red)`} />
        <path d="M23 250 Q45 264 71 250 M24 265 Q46 277 69 265" stroke="#dfbc80" strokeWidth="1.5" opacity=".65" />
        <ellipse cx="36" cy="244" rx="6" ry="3" transform="rotate(-35 36 244)" fill="#ffe9d9" opacity=".35" />
      </g>
      <g transform="translate(78 79) rotate(-24)">
        <path d="M0 0 C-52 -38 -49 26 -4 9 L-20 61 L-4 52 L5 59 L9 13 L30 55 L35 40 L49 43 L16 6 C66 17 45 -40 8 -3Z" fill="#752b38" stroke="#b55b61" strokeWidth="1" />
        <path d="M-2 2 L-34 -8 M12 2 L38 -9 M4 12 L-10 49 M13 11 L35 40" stroke="#e19a88" strokeOpacity=".3" />
        <rect x="-3" y="-5" width="17" height="19" rx="5" fill="#9b404a" />
      </g>
      {[[20, 108], [57, 56], [97, 39], [147, 18], [13, 153], [190, 8]].map(([x, y], i) => (
        <g key={i} className="winter-light" style={{ animationDelay: `${-i * 0.7}s` }}>
          <circle cx={x} cy={y} r="7" fill="#f6d391" opacity=".1" />
          <circle cx={x} cy={y} r="2.2" fill="#ffe4aa" />
        </g>
      ))}
    </svg>
  );
}

export default function ChristmasDecorations() {
  return (
    <div className="winter-scene" aria-hidden="true">
      <ChristmasCursorTrail />
      <div className="winter-top-thread" />
      <WinterCorner side="left" />
      <WinterCorner side="right" />
      <div className="winter-snow">
        {snow.map((flake, i) => (
          <i key={i} style={{ left: flake.left, width: flake.size, height: flake.size, "--snow-duration": flake.duration, "--snow-delay": flake.delay, "--snow-drift": flake.drift }} />
        ))}
      </div>
    </div>
  );
}
