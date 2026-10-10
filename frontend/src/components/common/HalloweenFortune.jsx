import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "hooks/useAuth";
import movieService from "services/movie.service";
import cursorEffectService from "services/cursorEffect.service";
import { Ghost } from "./GhostLoader";

const FORTUNE_KEY = "cinephine:halloween-fortune";
const HORROR_GENRE = "kinh-di";
const UNWRAP_MS = 750;
const CANDY_COLORS = ["#ff7a1a", "#8b5cf6", "#5ee08f"];
const VN_OFFSET = 7 * 3600e3;

// Chances and coins must match FORTUNE_TIERS in backend/services/halloweenFortune.service.js.
export const FORTUNE_TIERS = {
  "dai-cat": { name: "Đại Cát", icon: "🌟", chance: 5, coins: 100, mood: "hug" },
  cat: { name: "Cát", icon: "🍀", chance: 25, coins: 30, mood: "hug" },
  binh: { name: "Bình", icon: "🕯️", chance: 50, coins: 10, mood: "idle" },
  hung: { name: "Hung", icon: "🦇", chance: 20, coins: 1, mood: "scared" },
};

const FORTUNE_LINES = {
  "dai-cat": [
    "Bí ngô cười toe toét với bạn, hôm nay làm gì cũng trúng mánh!",
    "Ma nhỏ đi theo phù hộ, xem phim nào cũng gặp cái kết thật hay.",
    "Trăng tròn chiếu đúng chỗ bạn ngồi, may mắn ngập cả túi kẹo.",
    "Phù thủy đã niệm chú cho bạn, điều đang mong sắp thành thật.",
    "Hôm nay bạn là nhân vật chính, cú twist nào cũng nghiêng về phía bạn.",
    "Cả lâu đài ma mở tiệc chào đón bạn, cứ tự tin mà tỏa sáng!",
  ],
  cat: [
    "Một tin vui nhỏ đang bay tới như dơi về tổ.",
    "Bạn sẽ gặp bộ phim hợp gu ngay lần lướt đầu tiên.",
    "Đèn bí ngô soi đường, việc khó hôm nay hóa dễ.",
    "Có người đang nhắc tới bạn kèm một nụ cười, đừng bất ngờ nhé.",
    "Mèo đen đi ngang qua, nhưng lần này nó mang may mắn tới.",
    "Nồi thuốc của phù thủy hôm nay toàn nấu ra vị ngọt.",
  ],
  binh: [
    "Ngày êm như sương đêm, cứ thong thả mà tận hưởng.",
    "Ma nhỏ dặn: ăn no, ngủ kỹ, tối nay xem một phim thật cuốn.",
    "Hôm nay chẳng có gì đáng sợ, kể cả phim kinh dị.",
    "Một ly trà nóng và một tập phim mới là đủ cho ngày hoàn hảo.",
    "Gió thu nhè nhẹ, mọi việc trôi chậm mà chắc.",
    "Bí ngô ngủ gật rồi, bạn cũng nên cho mình nghỉ một chút.",
  ],
  hung: [
    "Dơi bay lạc hướng, hôm nay nhớ đọc kỹ trước khi bấm gửi.",
    "Ma nhỏ giấu mất chiếc tất của bạn, mai sẽ trả lại kèm quà.",
    "Đèn bí ngô chập chờn, tối nay đừng xem phim ma một mình nhé.",
    "Cẩn thận, spoiler đang rình ở góc phố nào đó.",
    "Phù thủy niệm nhầm chú, hôm nay chỉ hơi lận đận một chút thôi.",
    "Có tiếng cót két sau lưng... chỉ là cánh cửa thôi, bình tĩnh!",
  ],
};

// ponytail: Vietnam has no DST, so a fixed +7 offset is the whole timezone logic.
export const vnDayKey = (now = Date.now()) => new Date(now + VN_OFFSET).toISOString().slice(0, 10);

const untilNextCandy = (now = Date.now()) => {
  const left = 86400e3 - ((now + VN_OFFSET) % 86400e3);
  const hours = Math.floor(left / 3600e3);
  const minutes = Math.floor((left % 3600e3) / 60e3);
  return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
};

const storeKey = (userId) => `${FORTUNE_KEY}:${userId || "guest"}`;

const readToday = (userId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(userId)));
    return saved?.dateKey === vnDayKey() && FORTUNE_TIERS[saved.tier] ? saved : null;
  } catch {
    return null;
  }
};

const saveToday = (userId, result) => {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(result));
  } catch {
    // ponytail: storage blocked -> members re-fetch the same draw from the server, guests just draw again.
  }
};

// Guests get a free cosmetic draw with no coins; real draws happen on the server.
const rollGuest = () => {
  let left = Math.random() * 100;
  const tier = Object.keys(FORTUNE_TIERS).find((key) => (left -= FORTUNE_TIERS[key].chance) < 0) || "hung";
  return { dateKey: vnDayKey(), tier, coins: 0, pick: Math.floor(Math.random() * 1000), guest: true };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Candy({ color }) {
  return (
    <svg viewBox="0 0 64 40" aria-hidden="true">
      <path d="M19 20 4 7l3 13-3 13z" fill={color} opacity=".7" />
      <path d="M45 20 60 7l-3 13 3 13z" fill={color} opacity=".7" />
      <circle cx="32" cy="20" r="15" fill={color} />
      <path d="M24 9q9 11 0 22M32 5q9 15 0 30M40 9q9 11 0 22" stroke="#fff" strokeOpacity=".4" strokeWidth="3" fill="none" />
      <ellipse cx="26" cy="13" rx="5" ry="2.6" fill="#fff" opacity=".55" />
    </svg>
  );
}

function FortuneMovie({ pick, onWatch }) {
  const [movie, setMovie] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data = [] } = (await movieService.getByGenre(HORROR_GENRE, { limit: 40 })) || {};
        if (alive && data.length) setMovie(data[pick % data.length]);
      } catch (error) {
        console.warn("Fortune movie failed:", error);
      }
    })();
    return () => { alive = false; };
  }, [pick]);

  if (!movie?.id) return null;
  return (
    <div className="halloween-fortune-movie">
      {movie.poster && <img src={movie.poster} alt="" width={42} height={60} loading="lazy" />}
      <span>
        <small>🎬 Phim của quẻ</small>
        <b>{movie.title}</b>
      </span>
      <button type="button" onClick={() => onWatch(movie.id)}>Xem ngay</button>
    </div>
  );
}

function FortuneReward({ result, onLogin }) {
  if (result.guest) {
    return (
      <p className="halloween-fortune-coins is-locked">
        🔒 Quẻ thử chưa kèm xu
        <button type="button" onClick={onLogin}>Đăng nhập để bốc kẹo có thưởng tới 100 xu</button>
      </p>
    );
  }
  if (result.tier === "hung") {
    return <p className="halloween-fortune-coins is-charm">+{result.coins} xu an ủi · 🧿 Bùa hộ mệnh: kẹo ngày mai chắc chắn từ Cát trở lên</p>;
  }
  return <p className="halloween-fortune-coins">+{result.coins} xu</p>;
}

export default function HalloweenFortune({ onClose }) {
  const navigate = useNavigate();
  const { user, openAuthModal, updateUser } = useAuth();
  const userId = user?._id || user?.id || null;
  const [result, setResult] = useState(() => readToday(userId));
  const [picked, setPicked] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const draw = async (index) => {
    setPicked(index);
    setFailed(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const [res] = await Promise.all([
        userId ? cursorEffectService.drawHalloweenFortune() : rollGuest(),
        wait(reduced ? 0 : UNWRAP_MS),
      ]);
      if (!FORTUNE_TIERS[res?.tier]) throw new Error("Unknown fortune tier");
      const next = { dateKey: res.dateKey, tier: res.tier, coins: res.coins, charmed: res.charmed, pick: res.pick, guest: res.guest };
      saveToday(userId, next);
      if (!res.alreadyDrawn && res.coins > 0 && Number.isFinite(res.coinBalance)) {
        updateUser({ ...user, coin: res.coinBalance });
      }
      setResult(next);
    } catch (error) {
      console.warn("Halloween fortune failed:", error);
      setFailed(true);
      setPicked(null);
    }
  };

  const login = () => {
    onClose();
    openAuthModal("login");
  };

  const watch = (movieId) => {
    onClose();
    navigate(`/movie/${movieId}`);
  };

  const tier = result && FORTUNE_TIERS[result.tier];
  const lines = result && FORTUNE_LINES[result.tier];

  return (
    <div className="halloween-reward" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="halloween-reward-card halloween-fortune" role="dialog" aria-modal="true" aria-labelledby="halloween-fortune-title">
        <button type="button" className="halloween-reward-close" aria-label="Đóng" onClick={onClose}>×</button>
        <svg className="halloween-reward-ghost" viewBox="-60 -40 120 130" fill="none" aria-hidden="true">
          <g className="ghost-float"><Ghost mood={tier?.mood || "idle"} /></g>
        </svg>
        {result ? (
          <>
            <p className="halloween-reward-kicker">{result.charmed ? "🧿 Bùa hộ mệnh đã phát huy" : "🍬 Kẹo Tiên Tri"}</p>
            <h2 id="halloween-fortune-title">Quẻ hôm nay của bạn</h2>
            <div className={`halloween-fortune-card is-${result.tier}`}>
              <p className="halloween-fortune-tier"><span aria-hidden="true">{tier.icon}</span>{tier.name}</p>
              <p className="halloween-fortune-line">“{lines[result.pick % lines.length]}”</p>
              <FortuneReward result={result} onLogin={login} />
            </div>
            <FortuneMovie pick={result.pick} onWatch={watch} />
            <p className="halloween-fortune-next">Kẹo mới sau {untilNextCandy()}</p>
          </>
        ) : (
          <>
            <p className="halloween-reward-kicker">🍬 Kẹo Tiên Tri · mỗi ngày 1 viên</p>
            <h2 id="halloween-fortune-title">Chọn một viên kẹo</h2>
            <div className="halloween-candies">
              {CANDY_COLORS.map((color, index) => (
                <button
                  key={color}
                  type="button"
                  className={`halloween-candy${picked === index ? " is-open" : ""}`}
                  style={{ "--i": index }}
                  aria-label={`Kẹo số ${index + 1}`}
                  disabled={picked !== null}
                  autoFocus={index === 1}
                  onClick={() => draw(index)}
                >
                  <Candy color={color} />
                </button>
              ))}
            </div>
            <p className="halloween-reward-text">
              {failed && "Ui, kẹo dính tay rồi. Chọn lại giúp mình nhé! "}
              {userId
                ? "Mỗi viên giấu một quẻ cho hôm nay, kèm theo xu thưởng tới 100 xu."
                : "Bốc thử quẻ miễn phí. Đăng nhập để kẹo có thêm xu thưởng."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
