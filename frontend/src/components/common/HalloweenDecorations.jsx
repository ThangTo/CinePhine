import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import useAuth from "hooks/useAuth";
import { Ghost } from "./GhostLoader";
import { followPointer } from "./HalloweenCat";
import HalloweenTreats from "./HalloweenTreats";

// Deterministic cobweb: radial threads plus sagging rings between them.
const WEB_ANGLES = [0, 17, 35, 55, 73, 90].map((deg) => deg * Math.PI / 180);
const webPoint = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)].map((v) => v.toFixed(1));
const WEB_PATH = [
  ...WEB_ANGLES.map((angle) => `M0 0L${webPoint(205, angle).join(" ")}`),
  ...[30, 62, 98, 136, 176].map((radius) => WEB_ANGLES.map((angle, i) => (i
    ? `Q${webPoint(radius * .8, (angle + WEB_ANGLES[i - 1]) / 2).join(" ")} ${webPoint(radius, angle).join(" ")}`
    : `M${webPoint(radius, angle).join(" ")}`)).join("")),
].join("");
const WEB_DEW = [[62, 1], [98, 3], [136, 2]].map(([radius, i]) => webPoint(radius, WEB_ANGLES[i]));

const EYES = [
  { place: { left: "clamp(160px, 16vw, 232px)", bottom: "2%" }, width: 46, delay: "0s" },
  { place: { right: "4%", bottom: "18%" }, width: 38, delay: "-6s" },
  { place: { left: "1%", top: "46%" }, width: 32, delay: "-11s" },
];

const SPIDER_REST = 86;
const SPIDER_MAX = 240;
const SPIDER_DROP = .42; // share of the viewport height the spider descends at 100% scroll
const LIGHTNING_GAP = [45000, 90000];
const BAT = "q6-6 12 0q6-6 12 0q-6 2-12 6q-6-4-12-6Z";
const GHOST_OFFSET = { x: 18, y: 22 };

function Cobweb({ side }) {
  return (
    <svg className={`halloween-web halloween-web--${side}`} viewBox="-2 -2 212 212" fill="none">
      <path d={WEB_PATH} stroke="#e8def5" strokeOpacity=".3" />
      {WEB_DEW.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.8" fill="#ffb46b" />
      ))}
    </svg>
  );
}

function Spider() {
  const rootRef = useRef(null);
  const threadRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pos = { x: 0, y: SPIDER_REST };
    let restY = SPIDER_REST;
    let anchor = null;
    let frame = null;
    let pointerId = null;

    const place = () => {
      const angle = Math.atan2(-pos.x, pos.y) * 180 / Math.PI;
      threadRef.current.style.transform = `rotate(${angle}deg) scaleY(${Math.hypot(pos.x, pos.y) / 100})`;
      body.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${angle}deg)`;
    };
    const rest = () => {
      pos.x = 0;
      pos.y = restY;
      place();
      frame = null;
      root.classList.remove("is-held");
    };
    // Damped spring back to the resting point; underdamped so it bounces a little.
    const springBack = () => {
      if (reduced.matches) return rest();
      let vx = 0;
      let vy = 0;
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min((now - last) / 1000, .032);
        last = now;
        vx += (-90 * pos.x - 6 * vx) * dt;
        vy += (-90 * (pos.y - restY) - 6 * vy) * dt;
        pos.x += vx * dt;
        pos.y += vy * dt;
        if (Math.abs(pos.x) + Math.abs(pos.y - restY) < .4 && Math.abs(vx) + Math.abs(vy) < 3) return rest();
        place();
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    const onDown = (event) => {
      if (event.button !== 0 || pointerId !== null) return;
      event.preventDefault();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pointerId = event.pointerId;
      body.setPointerCapture(pointerId);
      root.classList.add("is-held");
      const rect = root.getBoundingClientRect();
      anchor = { x: rect.left, y: rect.top };
    };
    const onMove = (event) => {
      if (event.pointerId !== pointerId) return;
      let x = event.clientX - anchor.x;
      let y = Math.max(16, event.clientY - anchor.y);
      const length = Math.hypot(x, y);
      const max = Math.max(SPIDER_MAX, restY + 60);
      if (length > max) {
        x *= max / length;
        y *= max / length;
      }
      pos.x = x;
      pos.y = y;
      place();
    };
    const onUp = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      springBack();
    };

    // The thread doubles as a scroll progress bar: the spider lowers itself as the page scrolls.
    const onScroll = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      restY = SPIDER_REST + (room > 0 ? Math.min(window.scrollY / room, 1) : 0) * window.innerHeight * SPIDER_DROP;
      if (pointerId === null && frame === null) rest();
    };

    onScroll();
    body.addEventListener("pointerdown", onDown);
    body.addEventListener("pointermove", onMove);
    body.addEventListener("pointerup", onUp);
    body.addEventListener("pointercancel", onUp);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      body.removeEventListener("pointerdown", onDown);
      body.removeEventListener("pointermove", onMove);
      body.removeEventListener("pointerup", onUp);
      body.removeEventListener("pointercancel", onUp);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={rootRef} className="halloween-spider">
      <i ref={threadRef} className="halloween-spider-thread" />
      <svg ref={bodyRef} className="halloween-spider-body" viewBox="-20 0 40 34" fill="none">
        <path d="M0 0V7" stroke="#e8def5" strokeOpacity=".6" />
        <g className="halloween-spider-legs" stroke="#2a1e30" strokeWidth="1.8" strokeLinecap="round">
          {[-1, 1].flatMap((s) => [0, 1, 2, 3].map((i) => (
            <path key={`${s}${i}`} d={`M${s * 7} ${12 + i * 3.4}Q${s * 16} ${4 + i * 5.5} ${s * 19.5} ${14 + i * 5.2}`} />
          )))}
        </g>
        <circle cx="0" cy="16" r="10" fill="#241a2c" stroke="#8f6bd6" strokeOpacity=".6" strokeWidth="1.2" />
        <path d="M-4 6.5l4 2 4-2v4l-4-2-4 2z" fill="#ff7a1a" />
        <circle cx="-4" cy="15" r="3.4" fill="#f5ede6" />
        <circle cx="4" cy="15" r="3.4" fill="#f5ede6" />
        <circle cx="-4" cy="15.8" r="1.7" fill="#1f0e04" />
        <circle cx="4" cy="15.8" r="1.7" fill="#1f0e04" />
        <circle cx="-3.2" cy="14.2" r=".7" fill="#fff" />
        <circle cx="4.8" cy="14.2" r=".7" fill="#fff" />
        <ellipse cx="-7.2" cy="20" rx="2" ry="1.1" fill="#ff9fb0" opacity=".8" />
        <ellipse cx="7.2" cy="20" rx="2" ry="1.1" fill="#ff9fb0" opacity=".8" />
        <path d="M-2 20.5Q0 22.3 2 20.5" stroke="#f5ede6" strokeWidth=".9" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function PeekingEyes() {
  const refs = useRef([]);
  // Eyes squint shyly when the cursor gets close.
  useEffect(() => followPointer(() => refs.current, (element, distance) => element.classList.toggle("is-shy", distance < 110)), []);

  return EYES.map(({ place, width, delay }, i) => (
    <svg
      key={i}
      ref={(element) => { refs.current[i] = element; }}
      className={`halloween-eyes${i ? " halloween-eyes--extra" : ""}`}
      viewBox="0 0 44 20"
      style={{ ...place, width, "--peek-delay": delay }}
    >
      <g className="halloween-eyes-shy">
        <g className="halloween-eyes-blink">
          <circle cx="11" cy="10" r="8" fill="#ffcf6b" />
          <circle cx="33" cy="10" r="8" fill="#ffcf6b" />
          <g className="halloween-pupils">
            <circle cx="11" cy="10" r="3.6" fill="#1f0e04" />
            <circle cx="33" cy="10" r="3.6" fill="#1f0e04" />
            <circle cx="12.5" cy="8.3" r="1.1" fill="#fff" />
            <circle cx="34.5" cy="8.3" r="1.1" fill="#fff" />
          </g>
        </g>
      </g>
    </svg>
  ));
}

function GhostFollower() {
  const ref = useRef(null);
  const moodRef = useRef("idle");
  const [mood, setMood] = useState("idle");
  const { user } = useAuth();
  const equipped = user?.cursorEffectId;
  const disabled = Boolean(equipped && equipped !== "none");

  useEffect(() => {
    if (disabled) return undefined;
    const element = ref.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(any-pointer: fine)");
    const pos = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let frame = null;
    let last = 0;
    let lastMove = 0;
    let speed = 0;
    let facing = 1;
    let visible = false;
    let idleTimer = null;
    let calmTimer = null;

    const changeMood = (next) => {
      if (moodRef.current === next) return;
      moodRef.current = next;
      setMood(next);
    };
    const show = (next) => {
      if (visible === next) return;
      visible = next;
      element.classList.toggle("is-visible", next);
    };
    const render = (tilt) => {
      element.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;
    };
    const step = (now) => {
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const ease = 1 - Math.exp(-dt * 6);
      pos.x += dx * ease;
      pos.y += dy * ease;
      if (Math.abs(dx) > 6 && Math.sign(dx) !== facing) {
        facing = Math.sign(dx);
        element.style.setProperty("--ghost-face", facing);
      }
      render(Math.max(-14, Math.min(14, dx * .12)));
      frame = Math.abs(dx) + Math.abs(dy) > .4 ? requestAnimationFrame(step) : null;
    };
    const hide = () => {
      show(false);
      clearTimeout(idleTimer);
      changeMood("idle");
    };
    const onMove = (event) => {
      if (event.pointerType !== "mouse" || reduced.matches || !finePointer.matches || document.hidden || document.fullscreenElement) return hide();
      const now = performance.now();
      const next = { x: event.clientX + GHOST_OFFSET.x, y: event.clientY + GHOST_OFFSET.y };
      if (visible) {
        speed = speed * .6 + Math.hypot(next.x - target.x, next.y - target.y) / Math.max(now - lastMove, 8) * .4;
      } else {
        Object.assign(pos, next);
        speed = 0;
        render(0);
      }
      Object.assign(target, next);
      lastMove = now;
      show(!(event.target instanceof Element && event.target.closest("video, iframe, input, textarea, select, [contenteditable='true']")));
      // A fast flick startles the ghost; resting for a while makes it say "Boo!".
      if (speed > 2.2) {
        changeMood("scared");
        clearTimeout(calmTimer);
        calmTimer = setTimeout(() => changeMood("idle"), 900);
      } else if (moodRef.current === "boo") {
        changeMood("idle");
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => changeMood("boo"), 5000);
      if (frame === null) {
        last = now;
        frame = requestAnimationFrame(step);
      }
    };
    const onOut = (event) => { if (!event.relatedTarget) hide(); };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut);
    document.addEventListener("visibilitychange", hide);
    document.addEventListener("fullscreenchange", hide);
    reduced.addEventListener("change", hide);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      document.removeEventListener("visibilitychange", hide);
      document.removeEventListener("fullscreenchange", hide);
      reduced.removeEventListener("change", hide);
      if (frame !== null) cancelAnimationFrame(frame);
      clearTimeout(idleTimer);
      clearTimeout(calmTimer);
    };
  }, [disabled]);

  if (disabled) return null;
  return (
    <div ref={ref} className="halloween-ghost">
      <svg className="halloween-ghost-svg" viewBox="-50 -34 100 96" fill="none">
        <Ghost mood={mood} />
      </svg>
      {mood === "boo" && <span className="halloween-ghost-bubble">Boo!</span>}
    </div>
  );
}

function Pumpkins() {
  const id = useId().replace(/:/g, "");
  const skin = `url(#${id}-skin)`;
  return (
    <svg className="halloween-pumpkins" viewBox="0 0 240 150" fill="none">
      <defs>
        <radialGradient id={`${id}-skin`} cx=".4" cy=".35" r=".75"><stop stopColor="#ffa24a" /><stop offset=".6" stopColor="#f2711c" /><stop offset="1" stopColor="#b9480c" /></radialGradient>
        <radialGradient id={`${id}-candle`} cx=".5" cy=".4" r=".7"><stop stopColor="#fff4c2" /><stop offset="1" stopColor="#ffab3d" /></radialGradient>
        <radialGradient id={`${id}-halo`}><stop stopColor="#ff8a2a" stopOpacity=".45" /><stop offset="1" stopColor="#ff8a2a" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="112" rx="96" ry="46" fill={`url(#${id}-halo)`} />
      <ellipse cx="118" cy="144" rx="112" ry="6" fill="#000" opacity=".35" />
      <g>
        <path d="M80 52 Q78 40 86 32" stroke="#5b3b1c" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="50" cy="98" rx="34" ry="44" fill={skin} />
        <ellipse cx="110" cy="98" rx="34" ry="44" fill={skin} />
        <ellipse cx="80" cy="96" rx="38" ry="48" fill={skin} />
        <path d="M62 56 Q50 98 62 140 M98 56 Q110 98 98 140" stroke="#b9480c" strokeOpacity=".5" strokeWidth="2" />
        <path d="M84 48 Q100 30 112 42 Q98 50 84 48Z" fill="#4f7a3a" />
        <path d="M88 44 q14 -4 13 8 q-1 8 -9 5" stroke="#4f7a3a" strokeWidth="2" strokeLinecap="round" />
        <g fill={`url(#${id}-candle)`}>
          <path d="M52 92 Q61 76 70 92 Q61 86 52 92Z" />
          <path d="M90 92 Q99 76 108 92 Q99 86 90 92Z" />
          <path d="M56 104 Q80 132 104 104 Q80 116 56 104Z" />
        </g>
        <rect x="76.5" y="109" width="7" height="6" rx="1.5" fill="#f2711c" />
        <ellipse cx="44" cy="104" rx="7" ry="4" fill="#ff9fb0" opacity=".6" />
        <ellipse cx="116" cy="104" rx="7" ry="4" fill="#ff9fb0" opacity=".6" />
      </g>
      <g className="halloween-pumpkin-hop">
        <ellipse cx="160" cy="120" rx="20" ry="24" fill={skin} />
        <ellipse cx="190" cy="120" rx="20" ry="24" fill={skin} />
        <ellipse cx="175" cy="118" rx="22" ry="26" fill={skin} />
        <path d="M166 96 Q160 119 166 143 M184 96 Q190 119 184 143" stroke="#b9480c" strokeOpacity=".5" strokeWidth="1.5" />
        <g fill="#ffd98a">
          <circle cx="167" cy="116" r="4" />
          <circle cx="183" cy="116" r="4" />
          <path d="M169 125 Q175 132 181 125" stroke="#ffd98a" strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
        <ellipse cx="159" cy="124" rx="4.5" ry="2.6" fill="#ff9fb0" opacity=".6" />
        <ellipse cx="191" cy="124" rx="4.5" ry="2.6" fill="#ff9fb0" opacity=".6" />
        <ellipse cx="175" cy="94" rx="27" ry="5.5" fill="#2e2140" />
        <path d="M160 94 Q166 72 172 58 Q176 48 186 50 Q178 56 180 68 L190 94Z" fill="#3b2a55" />
        <path d="M162 86 H187 L188.6 91 H161Z" fill="#ff7a1a" />
      </g>
      <g transform="rotate(-12 130 138)">
        <path d="M117 138 l-8 -6 v12z M143 138 l8 -6 v12z" fill="#b89cf0" />
        <ellipse cx="130" cy="138" rx="13" ry="8" fill="#8f6bd6" />
        <path d="M124 131 q3 7 0 14 M131 130 q3 8 0 16" stroke="#f5ede6" strokeOpacity=".7" strokeWidth="2.5" />
      </g>
      <g transform="rotate(14 222 134)">
        <path d="M222 120 L231 146 Q222 149 213 146Z" fill="#ff7a1a" />
        <path d="M215.1 140 H228.9 L231 146 Q222 149 213 146Z" fill="#ffd27a" />
        <path d="M222 120 L225.6 130.4 H218.4Z" fill="#fff6e6" />
      </g>
    </svg>
  );
}

// Rare, soft lightning: two pulses, never a strobe.
function Lightning() {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const [min, max] = LIGHTNING_GAP;
    let timer = null;
    const strike = () => {
      if (!reduced.matches && !document.hidden) element.classList.add("is-striking");
      timer = setTimeout(strike, min + Math.random() * (max - min));
    };
    const reset = (event) => { if (event.target === element) element.classList.remove("is-striking"); };
    timer = setTimeout(strike, 15000 + Math.random() * 15000);
    element.addEventListener("animationend", reset);
    return () => {
      clearTimeout(timer);
      element.removeEventListener("animationend", reset);
    };
  }, []);

  return <div ref={ref} className="halloween-lightning" />;
}

// Night landscape for the footer: the footer renders an empty `.halloween-nightscape` slot, the art stays in this lazy chunk.
function Nightscape() {
  const [slot, setSlot] = useState(null);
  const id = useId().replace(/:/g, "");
  useEffect(() => setSlot(document.querySelector(".halloween-nightscape")), []);
  if (!slot) return null;

  return createPortal(
    <svg className="halloween-manor" viewBox="0 0 320 200" fill="#07040b">
      <defs>
        <radialGradient id={`${id}-halo`}>
          <stop offset=".45" stopColor="#ff9a3d" stopOpacity=".3" />
          <stop offset="1" stopColor="#ff9a3d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-moon`} cx=".4" cy=".36">
          <stop offset="0" stopColor="#ffe3b0" />
          <stop offset="1" stopColor="#ff9a3d" />
        </radialGradient>
      </defs>
      <circle cx="214" cy="60" r="80" fill={`url(#${id}-halo)`} />
      <circle cx="214" cy="60" r="38" fill={`url(#${id}-moon)`} />
      <g fill="#d9661a" fillOpacity=".3">
        <circle cx="201" cy="50" r="7" />
        <circle cx="226" cy="73" r="5" />
        <circle cx="229" cy="46" r="3.5" />
      </g>
      <g className="halloween-nightscape-ghost" fill="none">
        <g transform="translate(0 52) scale(.3)"><Ghost mood="idle" /></g>
      </g>
      <g transform="translate(0 30)">
        <path d="M0 170Q70 122 150 128Q240 116 320 148V170Z" />
        <path d="M98 132V54L111 14L124 54V132ZM120 132V72L165 38L210 72V132ZM200 132V82L211 52L222 82V132ZM180 62V40H188V58Z" />
        <path d="M44 142L46 104M46 120L33 105M46 111L59 96L66 99M33 105L27 101" stroke="#07040b" strokeWidth="3" strokeLinecap="round" />
        <g className="halloween-manor-lights" fill="#ff9a3d">
          <rect x="107" y="66" width="6" height="9" rx="3" />
          <rect x="107" y="90" width="6" height="9" rx="3" />
          <rect x="136" y="84" width="10" height="12" rx="2" />
          <rect x="184" y="84" width="10" height="12" rx="2" />
          <rect x="208" y="96" width="6" height="8" rx="3" />
        </g>
        <path d="M157 132V112Q165 102 173 112V132Z" fill="#2a1630" />
      </g>
      {[[244, 66, 1, "0s"], [276, 44, .7, "-2.6s"], [146, 34, .6, "-4.1s"]].map(([x, y, scale, delay]) => (
        <g key={x} transform={`translate(${x} ${y}) scale(${scale})`}>
          <path className="halloween-bat" d={`M0 0${BAT}`} style={{ animationDelay: delay }} />
        </g>
      ))}
    </svg>,
    slot,
  );
}

// Hero flashlight: moves the lit circle of `.halloween-flashlight` (rendered by the home banner) to the mouse.
function Flashlight() {
  useEffect(() => {
    let light = null;
    let point = null;
    let frame = null;
    // One read + one write per frame, however fast pointermove fires.
    const update = () => {
      frame = null;
      if (!light?.isConnected) light = document.querySelector(".halloween-flashlight");
      if (!light) return;
      const rect = light.getBoundingClientRect();
      const x = point.x - rect.left;
      const y = point.y - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      light.classList.add("is-tracking");
      light.style.setProperty("--mx", `${x}px`);
      light.style.setProperty("--my", `${y}px`);
    };
    const onMove = (event) => {
      if (event.pointerType !== "mouse") return;
      point = { x: event.clientX, y: event.clientY };
      if (frame === null) frame = requestAnimationFrame(update);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

export default function HalloweenDecorations() {
  const { pathname } = useLocation();
  const watching = pathname.startsWith("/watch/");
  return (
    <>
      <div className="halloween-scene" aria-hidden="true">
        <Cobweb side="left" />
        <Cobweb side="right" />
        {!watching && (
          <>
            <Lightning />
            <div className="halloween-fog"><i /><i /><i /></div>
            {!pathname.startsWith("/account") && <><Pumpkins /><PeekingEyes /></>}
            <Spider />
            <GhostFollower />
          </>
        )}
      </div>
      {!watching && <><HalloweenTreats /><Flashlight /><Nightscape /></>}
    </>
  );
}
