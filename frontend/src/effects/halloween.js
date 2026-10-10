/**
 * Cursor Effect: Halloween — Đêm Hội Bí Ngô
 *
 * Tàn lửa cam tím bay lên theo con trỏ; cứ đi một quãng lại có một quả bí ngô
 * phát sáng nảy ra hoặc một chú dơi nhỏ vỗ cánh bay đi.
 * Phần thưởng của trò săn bí ngô ẩn (unlockType "event").
 */

import { registerCursorEffect } from "contexts/CursorEffectContext";

const EMBER_COLORS = ["#ff7a1a", "#ffb15c", "#ffd98a", "#b89cf0", "#8f6bd6"];
const CRITTER_EVERY_PX = 90;
const JUMP_PX = 200; // mouseRef starts at 0,0 -> the first move looks like a huge jump
const MAX_PARTICLES = 600;
const TAU = Math.PI * 2;

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const makeEmber = (x, y, now, s) => ({
  kind: "ember",
  x: x + rand(-4, 4) * s,
  y: y + rand(-4, 4) * s,
  vx: rand(-0.4, 0.4) * s,
  vy: rand(-1.4, -0.4) * s,
  size: rand(0.8, 2) * s,
  born: now,
  life: rand(900, 1400),
  flicker: rand(0, TAU),
  color: pick(EMBER_COLORS),
});

const makeCritter = (x, y, now, s) => {
  const bat = Math.random() < 0.35;
  return {
    kind: bat ? "bat" : "pumpkin",
    x,
    y,
    vx: (bat ? rand(-2, 2) : rand(-0.8, 0.8)) * s,
    vy: (bat ? rand(-1.6, -0.9) : rand(-2.6, -1.8)) * s,
    size: rand(6, 9) * s,
    angle: rand(-0.3, 0.3),
    spin: rand(-0.03, 0.03),
    born: now,
    life: bat ? 1600 : 1400,
  };
};

const fill = (g, color, draw) => {
  g.fillStyle = color;
  g.beginPath();
  draw();
  g.fill();
};

const drawEmber = (g, p, prog, age) => {
  g.globalAlpha = (1 - prog) * (0.6 + 0.4 * Math.sin(p.flicker + age / 60));
  g.shadowBlur = p.size * 6;
  g.shadowColor = p.color;
  fill(g, p.color, () => g.arc(p.x, p.y, p.size, 0, TAU));
};

const drawPumpkin = (g, p) => {
  const r = p.size;
  g.translate(p.x, p.y);
  g.rotate(p.angle);
  g.shadowBlur = r * 1.6;
  g.shadowColor = "#ff7a1a";
  fill(g, "#e9661a", () => {
    g.ellipse(-r * 0.45, 0, r * 0.6, r * 0.8, 0, 0, TAU);
    g.ellipse(r * 0.45, 0, r * 0.6, r * 0.8, 0, 0, TAU);
  });
  fill(g, "#ff8a2a", () => g.ellipse(0, 0, r * 0.62, r * 0.86, 0, 0, TAU));
  g.shadowBlur = 0;
  g.strokeStyle = "#6b8f3a";
  g.lineWidth = r * 0.22;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(0, -r * 0.75);
  g.quadraticCurveTo(r * 0.05, -r * 1.1, r * 0.32, -r * 1.15);
  g.stroke();
  // Lit face: two triangle eyes and a grin
  fill(g, "#ffe08a", () => {
    g.moveTo(-r * 0.42, -r * 0.05);
    g.lineTo(-r * 0.25, -r * 0.36);
    g.lineTo(-r * 0.08, -r * 0.05);
    g.moveTo(r * 0.08, -r * 0.05);
    g.lineTo(r * 0.25, -r * 0.36);
    g.lineTo(r * 0.42, -r * 0.05);
    g.moveTo(-r * 0.4, r * 0.2);
    g.quadraticCurveTo(0, r * 0.62, r * 0.4, r * 0.2);
    g.quadraticCurveTo(0, r * 0.38, -r * 0.4, r * 0.2);
  });
};

// One bat wing in a 26x10 box around the body, d = -1 (left) or 1 (right).
const wing = (g, d) => {
  g.moveTo(0, -1);
  g.quadraticCurveTo(5 * d, -7, 13 * d, -4);
  g.quadraticCurveTo(10 * d, -1, 11 * d, 3);
  g.quadraticCurveTo(8.5 * d, 0.5, 6.5 * d, 3);
  g.quadraticCurveTo(4.5 * d, 0.5, 2 * d, 2.5);
  g.closePath();
};

const drawBat = (g, p, age) => {
  const k = p.size / 12;
  g.translate(p.x, p.y);
  g.scale(k, k);
  g.shadowBlur = 8;
  g.shadowColor = "#8f6bd6";
  g.save();
  g.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(age / 70)));
  fill(g, "#8f6bd6", () => {
    wing(g, -1);
    wing(g, 1);
  });
  g.restore();
  fill(g, "#a78bfa", () => {
    g.ellipse(0, 0.5, 2.6, 3.4, 0, 0, TAU);
    g.moveTo(-2, -2.2);
    g.lineTo(-1.5, -5);
    g.lineTo(-0.4, -3);
    g.moveTo(2, -2.2);
    g.lineTo(1.5, -5);
    g.lineTo(0.4, -3);
  });
  g.shadowBlur = 0;
  fill(g, "#ffe08a", () => {
    g.arc(-0.9, -0.3, 0.6, 0, TAU);
    g.moveTo(1.5, -0.3);
    g.arc(0.9, -0.3, 0.6, 0, TAU);
  });
};

const step = (p, age, s) => {
  p.x += p.vx;
  p.y += p.vy;
  if (p.kind === "ember") {
    p.vx += rand(-0.05, 0.05) * s;
    p.vy *= 0.99;
  } else if (p.kind === "pumpkin") {
    p.vy += 0.08 * s;
    p.angle += p.spin;
  } else {
    p.vy -= 0.01 * s;
    p.y += Math.sin(age / 120) * 0.3 * s;
  }
};

const draw = (g, p, prog, age) => {
  if (p.kind === "ember") return drawEmber(g, p, prog, age);
  g.globalAlpha = prog < 0.1 ? prog / 0.1 : prog > 0.65 ? (1 - prog) / 0.35 : 1;
  if (p.kind === "bat") return drawBat(g, p, age);
  const pop = Math.min(1, 0.4 + prog * 4);
  return drawPumpkin(g, { ...p, size: p.size * pop });
};

export const HalloweenEffectFactory = (ctx) => {
  const particles = [];
  const { canvas, mouseRef, needsEmitRef } = ctx;
  const s = ctx.scale || 1;
  let travel = 0;

  const emit = (now) => {
    const m = mouseRef.current;
    const dx = m.x - m.px;
    const dy = m.y - m.py;
    const dist = Math.hypot(dx, dy);
    m.px = m.x;
    m.py = m.y;
    if (dist > JUMP_PX * s) {
      particles.push(makeEmber(m.x, m.y, now, s));
      return;
    }
    const steps = Math.max(1, Math.min(Math.ceil(dist / (8 * s)), 6));
    for (let i = 1; i <= steps; i++) {
      const t = 1 - i / steps;
      particles.push(makeEmber(m.x - dx * t, m.y - dy * t, now, s));
    }
    travel += dist;
    if (travel >= CRITTER_EVERY_PX * s) {
      travel = 0;
      particles.push(makeCritter(m.x, m.y, now, s));
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  };

  const animate = () => {
    if (!canvas) return;
    const g = canvas.getContext("2d");
    const now = performance.now();
    if (needsEmitRef.current) {
      needsEmitRef.current = false;
      emit(now);
    }

    // Crisp shapes: clear instead of the fade-fill trail used by other effects
    g.clearRect(0, 0, canvas.width, canvas.height);
    const alive = particles.filter((p) => now - p.born < p.life);
    particles.length = 0;
    alive.forEach((p) => {
      const age = now - p.born;
      step(p, age, s);
      g.save();
      draw(g, p, age / p.life, age);
      g.restore();
      particles.push(p);
    });
  };

  ctx.registerAnimation(animate);
  return () => {
    particles.length = 0;
  };
};

registerCursorEffect("halloween", HalloweenEffectFactory);
