import React from "react";

const INK = "#1f0e04";
const BODY = "#f5ede6";

// Arm placement per mood: [cx, cy, rotation].
const ARMS = {
  idle: [[-36, 26, 0], [36, 26, 0]],
  scared: [[-37, 10, -35], [37, 10, 35]],
  boo: [[-41, -4, -55], [41, -4, 55]],
  hug: [[-15, 36, 20], [15, 36, -20]],
};

function Eyes({ mood }) {
  if (mood === "scared") {
    return <path d="M-16 1L-7 6L-16 11M16 1L7 6L16 11" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mood === "boo" || mood === "hug") {
    return <path d="M-16 7Q-11 0-6 7M6 7Q11 0 16 7" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />;
  }
  return (
    <g className="ghost-eyes">
      <ellipse cx="-11" cy="6" rx="5" ry="7" fill={INK} />
      <ellipse cx="11" cy="6" rx="5" ry="7" fill={INK} />
      <circle cx="-9" cy="3" r="1.8" fill="#fff" />
      <circle cx="13" cy="3" r="1.8" fill="#fff" />
    </g>
  );
}

function Mouth({ mood }) {
  if (mood === "scared") return <ellipse cx="0" cy="19" rx="3" ry="3.6" fill={INK} />;
  if (mood === "boo") {
    return (
      <g>
        <path d="M-7 14Q0 28 7 14Z" fill={INK} />
        <ellipse cx="0" cy="20.5" rx="3.2" ry="2" fill="#ff9fb0" />
      </g>
    );
  }
  return <path d="M-4 16Q0 20 4 16" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />;
}

function PumpkinBucket() {
  return (
    <g className="ghost-bucket">
      <path d="M14 34Q25 17 36 34" stroke="#c9b8a8" strokeWidth="1.6" />
      <ellipse cx="25" cy="41" rx="12" ry="10" fill="#ff7a1a" />
      <path d="M20 31.5Q25 29 30 31.5" stroke="#c2540a" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 39l2.5-3.2 2.5 3.2zM26 39l2.5-3.2 2.5 3.2z" fill={INK} />
      <path d="M19 44q6 4 12 0" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function FilmReel() {
  return (
    // Top edge sits at y=24, below the mouth (y<=19), so the face stays visible.
    <g transform="translate(0 41)">
      <path d="M12 8Q28 20 44 13" stroke="#2a1e30" strokeWidth="8" strokeLinecap="round" />
      <path d="M12 8Q28 20 44 13" stroke="#c9b8a8" strokeWidth="2.5" strokeDasharray="2 3" />
      <g className="ghost-reel">
        <circle r="16" fill="#2a1e30" stroke="#c9b8a8" strokeWidth="2" />
        {[[10, 0], [0, 10], [-10, 0], [0, -10]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4.2" fill="#0e0a12" />)}
        <circle r="2.6" fill="#c9b8a8" />
      </g>
    </g>
  );
}

/** Cute ghost drawn around (0, 0); moods: idle | scared | boo | hug. */
export function Ghost({ mood = "idle" }) {
  const arms = ARMS[mood] || ARMS.idle;
  return (
    <g className={`ghost ghost--${mood}`}>
      <path d="M-34 10A34 34 0 0 1 34 10L34 48Q28 58 22 48Q17 40 11 48Q6 58 0 48Q-6 40-11 48Q-17 58-22 48Q-28 40-34 48Z" fill={BODY} />
      <Eyes mood={mood} />
      <ellipse cx="-21" cy="16" rx="5" ry="3" fill="#ff9fb0" opacity=".75" />
      <ellipse cx="21" cy="16" rx="5" ry="3" fill="#ff9fb0" opacity=".75" />
      <Mouth mood={mood} />
      {mood === "scared" && <path className="ghost-sweat" d="M28 -14Q33 -5 28 -3Q23 -5 28 -14Z" fill="#8fd3ff" />}
      {mood === "hug" && <FilmReel />}
      {(mood === "idle" || mood === "scared") && <PumpkinBucket />}
      {arms.map(([x, y, r]) => <ellipse key={x} cx={x} cy={y} rx="7" ry="5" fill={BODY} transform={`rotate(${r} ${x} ${y})`} />)}
    </g>
  );
}

export default function GhostLoader() {
  return (
    <svg className="ghost-loader" viewBox="-60 -40 120 130" fill="none" aria-hidden="true">
      <ellipse className="ghost-shadow" cx="0" cy="82" rx="26" ry="5" fill="#000" opacity=".45" />
      <g className="ghost-float"><Ghost mood="hug" /></g>
    </svg>
  );
}
