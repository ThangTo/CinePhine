import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "hooks/useAuth";
import cursorEffectService from "services/cursorEffect.service";
import { HalloweenEffectFactory } from "effects/halloween";
import { Ghost } from "./GhostLoader";
import HalloweenFortune, { vnDayKey } from "./HalloweenFortune";

const HUNT_KEY = "cinephine:halloween-hunt";
const REWARD_EFFECT = "halloween";
const EFFECT_SHOP = "/account?tabs=effects";

// Pages a pumpkin can hide on (keyed by the first path segment). Which pages and spots change every day
// (VN time, same for everyone); one pumpkin per key. Found pages add up across days.
// Keys must match HALLOWEEN_HUNT_SPOTS in backend/services/cursorEffect.service.js.
export const HUNT_SPOTS = {
  home: "Trang chủ", genre: "Thể loại", country: "Quốc gia", movie: "Trang phim", type: "Phim lẻ / bộ",
  cast: "Diễn viên", search: "Tìm kiếm", filter: "Lọc phim", premium: "Premium", recharge: "Nạp xu",
};
export const HUNT_TOTAL = 5;

// FNV-1a hash + murmur3 finalizer -> [0, 1), so a day + page always lands on the same spot.
// The finalizer matters: plain FNV-1a barely moves the high bits when only the last character changes.
const seededRandom = (seed) => {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
};

export const huntSpotStyle = (key, day = vnDayKey()) => {
  const roll = seededRandom(`${day}:${key}`) * 3;
  const edge = Math.floor(roll); // 0 left, 1 right, 2 bottom
  const along = roll - edge; // 0..1 along that edge
  if (edge === 2) return { right: `${Math.round(25 + along * 45)}%`, bottom: "-8px", "--tilt": "0deg" };
  const tilt = Math.round(14 + along * 12);
  // 30-78% keeps it clear of the header and the chatbot button.
  return { [edge ? "right" : "left"]: "-7px", top: `${Math.round(30 + along * 48)}%`, "--tilt": `${edge ? -tilt : tilt}deg` };
};

// Today's hinted pages (menu chips), kept in HUNT_SPOTS order so the menu reads the same way every day.
export const huntPagesFor = (day = vnDayKey()) => {
  const picked = Object.keys(HUNT_SPOTS)
    .sort((a, b) => seededRandom(`${day}:page:${a}`) - seededRandom(`${day}:page:${b}`))
    .slice(0, HUNT_TOTAL);
  return Object.keys(HUNT_SPOTS).filter((key) => picked.includes(key));
};

// Hinted pages always hide one today; any other page (a genre, a movie, an actor...) has a 1 in 3 chance.
export const huntSpotFor = (pathname, day = vnDayKey()) => {
  const key = pathname.split("/")[1] || "home";
  if (!Object.hasOwn(HUNT_SPOTS, key)) return null;
  return huntPagesFor(day).includes(key) || seededRandom(`${day}:${pathname}`) < 1 / 3 ? key : null;
};

export const readHunt = () => {
  try {
    const found = JSON.parse(localStorage.getItem(HUNT_KEY));
    return Array.isArray(found) ? [...new Set(found)].filter((key) => Object.hasOwn(HUNT_SPOTS, key)) : [];
  } catch {
    return [];
  }
};

export const markHunt = (key) => {
  const found = readHunt();
  if (!Object.hasOwn(HUNT_SPOTS, key) || found.includes(key)) return found;
  const next = [...found, key];
  try {
    localStorage.setItem(HUNT_KEY, JSON.stringify(next));
  } catch {
    // ponytail: storage blocked (private mode) -> progress lasts for this tab only.
  }
  return next;
};

function MiniPumpkin() {
  return (
    <svg viewBox="0 0 40 36" fill="none">
      <path d="M20 8 Q19 3 23 1" stroke="#5b3b1c" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="12" cy="22" rx="10" ry="12" fill="#e9661a" />
      <ellipse cx="28" cy="22" rx="10" ry="12" fill="#e9661a" />
      <ellipse cx="20" cy="21" rx="11" ry="13.5" fill="#ff8a2a" />
      <path d="M14 19l2.5-3.5L19 19zM21 19l2.5-3.5L26 19zM14 25q6 5 12 0q-6 2-12 0z" fill="#ffd98a" />
    </svg>
  );
}

const claimedKey = (userId) => `${HUNT_KEY}:claimed:${userId}`;
const wasClaimed = (userId) => {
  try {
    return localStorage.getItem(claimedKey(userId)) === "1";
  } catch {
    return false;
  }
};

// Runs the real reward effect on a scripted figure-8 path so the popup shows what was won.
function EffectPreview() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !canvas?.getContext("2d")) return undefined;
    const mouseRef = { current: { x: 140, y: 60, px: 140, py: 60 } };
    const needsEmitRef = { current: false };
    let frame = () => {};
    let raf = 0;
    const cleanup = HalloweenEffectFactory({
      canvas, mouseRef, needsEmitRef, scale: 1, registerAnimation: (fn) => { frame = fn; },
    });
    const loop = (now) => {
      const t = now / 600;
      Object.assign(mouseRef.current, { x: 140 + Math.sin(t) * 105, y: 66 + Math.sin(t * 2) * 26 });
      needsEmitRef.current = true;
      frame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, []);
  return <canvas ref={canvasRef} className="halloween-reward-preview" width={280} height={120} aria-hidden="true" />;
}

const REWARD_COPY = {
  guest: "Đăng nhập để nhận miễn phí hiệu ứng con trỏ Đêm Hội Bí Ngô nhé!",
  claiming: "Con ma nhỏ đang gói quà cho bạn...",
  ready: "Hiệu ứng con trỏ Đêm Hội Bí Ngô đã vào kho của bạn. Tàn lửa, bí ngô phát sáng và dơi nhỏ sẽ bay theo từng cú lướt chuột.",
  failed: "Ui, gói quà bị kẹt rồi. Thử lại giúp mình nhé!",
};

export default function HalloweenTreats() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, openAuthModal, updateUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boo, setBoo] = useState(false);
  const [note, setNote] = useState("");
  const [found, setFound] = useState(readHunt);
  const [reward, setReward] = useState(null);
  const [fortune, setFortune] = useState(false);
  const rootRef = useRef(null);
  const timers = useRef({});
  const spot = huntSpotFor(pathname);
  const userId = user?._id || user?.id || null;
  const hunter = found.length >= HUNT_TOTAL;

  const later = (name, fn, ms) => {
    clearTimeout(timers.current[name]);
    timers.current[name] = setTimeout(fn, ms);
  };
  const say = (text) => {
    setNote(text);
    later("note", () => setNote(""), 3600);
  };

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const treat = () => {
    setOpen(false);
    setFortune(true);
  };
  const closeFortune = useCallback(() => setFortune(false), []);

  // Trick: flip the page content for a moment, or let a ghost jump out.
  const trick = () => {
    setOpen(false);
    const main = document.querySelector("main");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && main?.animate && Math.random() < .5) {
      const rect = main.getBoundingClientRect();
      const transformOrigin = `50% ${window.innerHeight / 2 - rect.top}px`;
      main.animate([
        { transformOrigin, transform: "none" },
        { transformOrigin, transform: "rotate(180deg)", offset: .3 },
        { transformOrigin, transform: "rotate(180deg)", offset: .72 },
        { transformOrigin, transform: "none" },
      ], { duration: 1800, easing: "ease-in-out" });
      say("Ghẹo đó! Lộn ngược thế giới 🙃");
      return;
    }
    setBoo(true);
    later("boo", () => setBoo(false), 1500);
  };

  const claim = async () => {
    setReward("claiming");
    try {
      await cursorEffectService.claimHalloweenHunt(readHunt());
      try {
        localStorage.setItem(claimedKey(userId), "1");
      } catch {
        // ponytail: storage blocked -> we just claim again next visit, the endpoint is idempotent.
      }
      setReward("ready");
    } catch (error) {
      console.warn("Halloween reward claim failed:", error);
      setReward("failed");
    }
  };

  // Logged in with a full hunt that this account has not claimed yet (incl. a guest who just signed in).
  useEffect(() => {
    if (hunter && userId && !wasClaimed(userId)) claim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hunter, userId]);

  useEffect(() => {
    if (!reward) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setReward(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reward]);

  const collect = () => {
    const next = markHunt(spot);
    setFound(next);
    if (next.length >= HUNT_TOTAL) {
      if (!userId) setReward("guest");
      return;
    }
    say(`Tìm thấy bí ngô ${next.length}/${HUNT_TOTAL}! Còn trốn ở trang khác nữa đó`);
  };

  const equip = async () => {
    setBusy(true);
    try {
      const res = await cursorEffectService.equip(REWARD_EFFECT);
      if (res?.cursorEffectId) updateUser({ ...user, cursorEffectId: res.cursorEffectId });
      setReward(null);
      say("Đã trang bị Đêm Hội Bí Ngô, lướt chuột thử xem 🎃");
    } catch (error) {
      console.warn("Halloween reward equip failed:", error);
      setReward("failed");
    } finally {
      setBusy(false);
    }
  };

  const login = () => {
    setReward(null);
    openAuthModal("login");
  };

  const rewardActions = {
    guest: <button type="button" onClick={login} autoFocus>Đăng nhập để nhận quà</button>,
    claiming: <button type="button" disabled>Đang gói quà...</button>,
    ready: (
      <>
        <button type="button" onClick={equip} disabled={busy} autoFocus>{busy ? "Đang trang bị..." : "Trang bị ngay"}</button>
        <button type="button" onClick={() => { setReward(null); navigate(EFFECT_SHOP); }}>Xem trong cửa hàng</button>
      </>
    ),
    failed: <button type="button" onClick={userId ? claim : login} autoFocus>Thử lại</button>,
  };

  return (
    <>
      {!pathname.startsWith("/account") && (
        <div ref={rootRef} className="halloween-treat">
          <button
            type="button"
            className="halloween-treat-btn"
            aria-label="Kẹo hay ghẹo?"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="halloween-treat-tip" aria-hidden="true">
              Kẹo hay ghẹo?
              <small>{hunter ? "🏆 Thợ Săn Bí Ngô" : `🎃 Săn bí ngô ${found.length}/${HUNT_TOTAL}`}</small>
            </span>
          </button>
          {open && (
            <div className="halloween-treat-menu" role="group" aria-label="Kẹo hay ghẹo">
              <p className="halloween-treat-title">Kẹo hay ghẹo?</p>
              <div className="halloween-treat-actions">
                <button type="button" onClick={treat}>🍬 Kẹo</button>
                <button type="button" onClick={trick}>👻 Ghẹo</button>
              </div>
              <p className="halloween-treat-hunt">
                {hunter ? "🏆 Thợ Săn Bí Ngô" : `🎃 Bí ngô ẩn: ${found.length}/${HUNT_TOTAL}`}
                <small>{hunter ? "Bạn đã tìm đủ cả 5 quả!" : "Bí ngô đang lẫn trốn ở các trang bất kì trong web, bật mí nhỏ tìm kĩ ở các góc màn hình. Tìm đủ 5 quả để nhận hiệu ứng con trỏ Halloween. Các trang gợi ý nè."}</small>
                {!hunter && (
                  <span className="halloween-hunt-places">
                    {huntPagesFor().map((key) => (
                      <span key={key} className={found.includes(key) ? "is-found" : undefined}>
                        {found.includes(key) ? "✓ " : ""}{HUNT_SPOTS[key]}
                      </span>
                    ))}
                  </span>
                )}
                {hunter && (
                  <button type="button" onClick={() => { setOpen(false); if (userId) claim(); else setReward("guest"); }}>🎁 Xem quà</button>
                )}
              </p>
            </div>
          )}
        </div>
      )}
      {spot && !hunter && !found.includes(spot) && (
        <button key={spot} type="button" className="halloween-hunt" style={huntSpotStyle(spot)} aria-label="Bí ngô ẩn" onClick={collect}>
          <MiniPumpkin />
        </button>
      )}
      <p className="halloween-treat-note" role="status">{note}</p>
      {boo && (
        <div className="halloween-boo" aria-hidden="true">
          <svg viewBox="-50 -34 100 96" fill="none"><Ghost mood="boo" /></svg>
          <b>BOO!</b>
        </div>
      )}
      {fortune && <HalloweenFortune onClose={closeFortune} />}
      {reward && (
        <div className="halloween-reward" onPointerDown={(event) => event.target === event.currentTarget && setReward(null)}>
          <div className="halloween-reward-card" role="dialog" aria-modal="true" aria-labelledby="halloween-reward-title">
            <button type="button" className="halloween-reward-close" aria-label="Đóng" onClick={() => setReward(null)}>×</button>
            <svg className="halloween-reward-ghost" viewBox="-60 -40 120 130" fill="none" aria-hidden="true">
              <g className="ghost-float"><Ghost mood="idle" /></g>
            </svg>
            <p className="halloween-reward-kicker">🏆 Thợ Săn Bí Ngô · {HUNT_TOTAL}/{HUNT_TOTAL}</p>
            <h2 id="halloween-reward-title">Bạn đã tìm đủ bí ngô ẩn!</h2>
            <EffectPreview />
            <p className="halloween-reward-text">{REWARD_COPY[reward]}</p>
            <div className="halloween-reward-actions">{rewardActions[reward]}</div>
          </div>
        </div>
      )}
    </>
  );
}
