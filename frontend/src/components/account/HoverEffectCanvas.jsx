/**
 * HoverEffectCanvas — Canvas nhỏ hiệu ứng, chỉ chạy khi hover vào card.
 * Giới hạn trong khu vực card. Không conflict với global cursor effect.
 */
import React, { useRef, useCallback, useEffect } from "react";
import { HalloweenEffectFactory } from "effects/halloween";

// ─── Glitter factory (preview) ─────────────────────────────────────────────────
const makeGlitterFactory = () => (ctx) => {
  const particles = [];
  const { canvas, mouseRef, needsEmitRef, scale } = ctx;
  const colors = ["#ffd875", "#ffe39f", "#fbbf24", "#f59e0b", "#ffffff", "#fde68a"];

  const makeParticle = (x, y, now) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 1.5 + 0.3) * scale;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: (Math.random() * 1.5 + 0.5) * scale,
      birthTime: now,
      maxLife: 1000,
      flickerPhase: Math.random() * Math.PI * 2,
      flickerSpeed: Math.random() * 0.08 + 0.04,
      color: colors[Math.floor(Math.random() * 4)],
    };
  };

  const animate = () => {
    const c = canvas;
    if (!c) return;
    const ctx2 = c.getContext("2d");
    const now = performance.now();

    if (needsEmitRef.current) {
      needsEmitRef.current = false;
      const { x, y, px, py } = mouseRef.current;
      const dx = x - px;
      const dy = y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= 3 * scale) {
        const steps = Math.min(Math.floor(dist / (6 * scale)), 5);
        for (let i = 1; i <= steps; i++) {
          const t = i / (steps + 1);
          const bx = px + dx * t;
          const by = py + dy * t;
          for (let k = 0; k < 3; k++) particles.push(makeParticle(bx, by, now));
        }
      } else {
        for (let k = 0; k < 3; k++) particles.push(makeParticle(x, y, now));
      }

      mouseRef.current.px = mouseRef.current.x;
      mouseRef.current.py = mouseRef.current.y;
      if (particles.length > 400) particles.splice(0, particles.length - 300);
    }

    ctx2.fillStyle = "rgba(0,0,0,0.18)";
    ctx2.fillRect(0, 0, c.width, c.height);

    const alive = particles.filter((p) => now - p.birthTime < p.maxLife);
    particles.length = 0;
    alive.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      const age = now - p.birthTime;
      const prog = Math.min(age / p.maxLife, 1);
      const fade = (1 - prog * prog) * ((Math.sin(p.flickerPhase + age * p.flickerSpeed) + 1) / 2);
      if (fade <= 0) {
        particles.push(p);
        return;
      }
      ctx2.save();
      ctx2.globalAlpha = fade * 0.9;
      ctx2.shadowBlur = p.size * 4;
      ctx2.shadowColor = p.color;
      ctx2.fillStyle = p.color;
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
      particles.push(p);
    });
  };

  ctx.registerAnimation(animate);
  return () => {
    particles.length = 0;
  };
};

// ─── Galaxy factory (preview) ──────────────────────────────────────────────────
const makeGalaxyFactory = () => (ctx) => {
  const particles = [];
  const { canvas, mouseRef, needsEmitRef, scale } = ctx;
  const colors = ["#a855f7", "#7c3aed", "#6366f1", "#818cf8", "#ec4899", "#f472b6", "#ffffff"];

  const makeParticle = (x, y, now) => ({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(Math.random() * Math.PI * 2) * (Math.random() * 1.0 + 0.2) * scale,
    vy: Math.sin(Math.random() * Math.PI * 2) * (Math.random() * 1.0 + 0.2) * scale,
    size: (Math.random() * 2.0 + 0.8) * scale,
    birthTime: now,
    maxLife: 1500,
    flickerPhase: Math.random() * Math.PI * 2,
    flickerSpeed: Math.random() * 0.04 + 0.02,
    color: colors[Math.floor(Math.random() * colors.length)],
    trailAlpha: 0.3 + Math.random() * 0.3,
  });

  const animate = () => {
    const c = canvas;
    if (!c) return;
    const ctx2 = c.getContext("2d");
    const now = performance.now();

    if (needsEmitRef.current) {
      needsEmitRef.current = false;
      const { x, y, px, py } = mouseRef.current;
      const dx = x - px;
      const dy = y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= 3 * scale) {
        const steps = Math.min(Math.floor(dist / (6 * scale)), 5);
        for (let i = 1; i <= steps; i++) {
          const t = i / (steps + 1);
          for (let k = 0; k < 3; k++) {
            particles.push(makeParticle(px + dx * t, py + dy * t, now));
          }
        }
      }
      mouseRef.current.px = mouseRef.current.x;
      mouseRef.current.py = mouseRef.current.y;
      if (particles.length > 400) particles.splice(0, particles.length - 300);
    }

    ctx2.fillStyle = "rgba(0,0,0,0.15)";
    ctx2.fillRect(0, 0, c.width, c.height);

    const alive = particles.filter((p) => now - p.birthTime < p.maxLife);
    particles.length = 0;
    alive.forEach((p) => {
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      const age = now - p.birthTime;
      const prog = age / p.maxLife;
      if (prog >= 1) {
        particles.push(p);
        return;
      }
      const fade =
        (1 - prog) * (0.6 + (0.4 * (Math.sin(p.flickerPhase + age * p.flickerSpeed) + 1)) / 2);
      if (fade <= 0) {
        particles.push(p);
        return;
      }
      ctx2.save();
      ctx2.globalAlpha = fade * p.trailAlpha;
      ctx2.strokeStyle = p.color;
      ctx2.lineWidth = p.size * 0.6;
      ctx2.lineCap = "round";
      ctx2.shadowBlur = p.size * 8;
      ctx2.shadowColor = p.color;
      ctx2.beginPath();
      ctx2.moveTo(p.prevX, p.prevY);
      ctx2.lineTo(p.x, p.y);
      ctx2.stroke();
      ctx2.globalAlpha = fade;
      ctx2.fillStyle = p.color;
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.globalAlpha = fade * 0.8;
      ctx2.fillStyle = "#ffffff";
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
      particles.push(p);
    });
  };

  ctx.registerAnimation(animate);
  return () => {
    particles.length = 0;
  };
};

// ─── Firefly factory (preview) ─────────────────────────────────────────────────
const makeFireflyFactory = () => (ctx) => {
  const particles = [];
  const { canvas, mouseRef, needsEmitRef, scale } = ctx;
  const colors = ["#fbbf24", "#a3e635", "#bef264", "#fde047", "#fef08a"];

  const makeParticle = (x, y, now) => ({
    x: x + (Math.random() - 0.5) * 20 * scale,
    y: y + (Math.random() - 0.5) * 15 * scale,
    vx: (Math.random() - 0.5) * 0.6 * scale,
    vy: (Math.random() * 0.5 + 0.2) * scale,
    size: (Math.random() * 1.2 + 1.0) * scale,
    birthTime: now,
    maxLife: 1800,
    flickerPhase: Math.random() * Math.PI * 2,
    flickerSpeed: Math.random() * 0.03 + 0.01,
    color: colors[Math.floor(Math.random() * colors.length)],
  });

  const animate = () => {
    const c = canvas;
    if (!c) return;
    const ctx2 = c.getContext("2d");
    const now = performance.now();

    if (needsEmitRef.current) {
      needsEmitRef.current = false;
      const { x, y } = mouseRef.current;
      for (let k = 0; k < 2; k++) particles.push(makeParticle(x, y, now));
      mouseRef.current.px = mouseRef.current.x;
      mouseRef.current.py = mouseRef.current.y;
      if (particles.length > 500) particles.splice(0, particles.length - 400);
    }

    ctx2.fillStyle = "rgba(0,0,0,0.08)";
    ctx2.fillRect(0, 0, c.width, c.height);

    const alive = particles.filter((p) => now - p.birthTime < p.maxLife);
    particles.length = 0;
    alive.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx = p.vx * 0.99 + (Math.random() - 0.5) * 0.03 * scale;
      p.vy *= 0.995;
      const age = now - p.birthTime;
      const prog = age / p.maxLife;
      if (prog >= 1) {
        particles.push(p);
        return;
      }
      let fade = prog < 0.1 ? prog / 0.1 : 1 - (prog - 0.1) / 0.9;
      fade *= 0.5 + (0.5 * (Math.sin(p.flickerPhase + age * p.flickerSpeed) + 1)) / 2;
      if (fade <= 0) {
        particles.push(p);
        return;
      }
      ctx2.save();
      ctx2.globalAlpha = fade;
      ctx2.shadowBlur = p.size * 12;
      ctx2.shadowColor = p.color;
      ctx2.fillStyle = p.color;
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.shadowBlur = 0;
      ctx2.fillStyle = "#ffffff";
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
      particles.push(p);
    });
  };

  ctx.registerAnimation(animate);
  return () => {
    particles.length = 0;
  };
};

// ─── Sakura factory (preview) ──────────────────────────────────────────────────
const makeSakuraFactory = () => (ctx) => {
  const particles = [];
  const { canvas, mouseRef, needsEmitRef, scale } = ctx;
  const colors = ["#fda4af", "#fecdd3", "#fce7f3", "#ffb7c5"];

  const makeParticle = (x, y, now) => ({
    x: x + (Math.random() - 0.5) * 30 * scale,
    y: y + (Math.random() - 0.5) * 20 * scale,
    vx: (Math.random() - 0.5) * 0.6 * scale,
    vy: (Math.random() * 0.5 + 0.2) * scale,
    size: (Math.random() * 3 + 3) * scale,
    widthRatio: 0.5 + Math.random() * 0.3,
    birthTime: now,
    maxLife: 2000,
    rotation: Math.random() * Math.PI,
    rotSpeed: (Math.random() - 0.5) * 0.03,
    driftPhase: Math.random() * Math.PI * 2,
    driftSpeed: Math.random() * 0.02 + 0.01,
    color: colors[Math.floor(Math.random() * colors.length)],
  });

  const animate = () => {
    const c = canvas;
    if (!c) return;
    const ctx2 = c.getContext("2d");
    const now = performance.now();

    if (needsEmitRef.current) {
      needsEmitRef.current = false;
      const { x, y } = mouseRef.current;
      for (let k = 0; k < 2; k++) particles.push(makeParticle(x, y, now));
      mouseRef.current.px = mouseRef.current.x;
      mouseRef.current.py = mouseRef.current.y;
      if (particles.length > 300) particles.splice(0, particles.length - 250);
    }

    ctx2.fillStyle = "rgba(0,0,0,0.05)";
    ctx2.fillRect(0, 0, c.width, c.height);

    const alive = particles.filter((p) => now - p.birthTime < p.maxLife);
    particles.length = 0;
    alive.forEach((p) => {
      p.driftPhase += p.driftSpeed;
      p.x += p.vx + Math.sin(p.driftPhase) * 0.3 * scale;
      p.y += p.vy;
      p.vx *= 0.99;
      p.vy *= 0.995;
      p.rotation += p.rotSpeed;
      const prog = (now - p.birthTime) / p.maxLife;
      if (prog >= 1) {
        particles.push(p);
        return;
      }
      let op = prog < 0.05 ? prog / 0.05 : prog > 0.8 ? 1 - (prog - 0.8) / 0.2 : 1;
      if (op <= 0) {
        particles.push(p);
        return;
      }
      ctx2.save();
      ctx2.translate(p.x, p.y);
      ctx2.rotate(p.rotation);
      ctx2.globalAlpha = op;
      ctx2.shadowBlur = p.size * 1.5;
      ctx2.shadowColor = p.color;
      ctx2.fillStyle = p.color;
      ctx2.beginPath();
      ctx2.ellipse(0, 0, p.size * p.widthRatio, p.size, 0, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.globalAlpha = op * 0.3;
      ctx2.strokeStyle = "#ffffff";
      ctx2.lineWidth = 0.5;
      ctx2.beginPath();
      ctx2.moveTo(0, -p.size * 0.8);
      ctx2.lineTo(0, p.size * 0.8);
      ctx2.stroke();
      ctx2.restore();
      particles.push(p);
    });
  };

  ctx.registerAnimation(animate);
  return () => {
    particles.length = 0;
  };
};

// ─── Snowflake factory (preview) ─────────────────────────────────────────────
const makeSnowflakeFactory = () => (ctx) => {
  const particles = [];
  const { canvas, mouseRef, needsEmitRef, scale } = ctx;
  const colors = ["#bae6fd", "#7dd3fc", "#38bdf8", "#e0f2fe", "#f0f9ff"];

  const buildPath = (size, depth) => {
    const path = new Path2D();
    const armLen = size;
    const subLen = armLen * 0.4;
    const subMid = armLen * 0.6;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const ex = Math.sin(a) * armLen;
      const ey = -Math.cos(a) * armLen;
      path.moveTo(0, 0);
      path.lineTo(ex, ey);
      if (depth >= 2) {
        const mx = Math.sin(a) * subMid;
        const my = -Math.cos(a) * subMid;
        const a1 = a + Math.PI / 5;
        const a2 = a - Math.PI / 5;
        path.moveTo(mx, my);
        path.lineTo(mx + Math.sin(a1) * subLen, my - Math.cos(a1) * subLen);
        path.moveTo(mx, my);
        path.lineTo(mx + Math.sin(a2) * subLen, my - Math.cos(a2) * subLen);
      }
    }
    return path;
  };

  const animate = () => {
    const c = canvas;
    if (!c) return;
    const ctx2 = c.getContext("2d");
    const now = performance.now();

    if (needsEmitRef.current) {
      needsEmitRef.current = false;
      const { x, y } = mouseRef.current;
      for (let k = 0; k < 2; k++) {
        const size = (Math.random() * 2.5 + 3.5) * scale;
        particles.push({
          x: x + (Math.random() - 0.5) * 30 * scale,
          y: y + (Math.random() - 0.5) * 20 * scale,
          size,
          depth: size > 5 * scale ? 3 : 2,
          birthTime: now,
          maxLife: 1200,
          rotation: Math.random() * Math.PI,
          rotSpeed: (Math.random() - 0.5) * 0.02,
          color: colors[Math.floor(Math.random() * colors.length)],
          flakePath: buildPath(size, size > 5 * scale ? 3 : 2),
        });
      }
      mouseRef.current.px = mouseRef.current.x;
      mouseRef.current.py = mouseRef.current.y;
      if (particles.length > 300) particles.splice(0, particles.length - 250);
    }

    ctx2.fillStyle = "rgba(0,0,0,0.18)";
    ctx2.fillRect(0, 0, c.width, c.height);

    const alive = particles.filter((p) => now - p.birthTime < p.maxLife);
    particles.length = 0;
    alive.forEach((p) => {
      p.x += p.vx || 0;
      p.y += p.vy || 0;
      p.vx = (p.vx || 0) * 0.97;
      p.vy = (p.vy || 0) * 0.97;
      p.rotation += p.rotSpeed;
      const prog = (now - p.birthTime) / p.maxLife;
      const fade = (1 - prog * prog) * 0.85 + 0.15;
      if (fade <= 0) {
        particles.push(p);
        return;
      }
      ctx2.save();
      ctx2.translate(p.x, p.y);
      ctx2.rotate(p.rotation);
      ctx2.globalAlpha = fade;
      ctx2.shadowBlur = p.size * 2.5;
      ctx2.shadowColor = p.color;
      ctx2.strokeStyle = p.color;
      ctx2.lineWidth = p.size > 5 ? 0.8 : 0.6;
      ctx2.lineCap = "round";
      ctx2.stroke(p.flakePath);
      ctx2.globalAlpha = fade * 0.9;
      ctx2.shadowBlur = p.size * 4;
      ctx2.shadowColor = "#ffffff";
      ctx2.fillStyle = "#ffffff";
      ctx2.beginPath();
      ctx2.arc(0, 0, p.size * 0.2, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
      particles.push(p);
    });
  };

  ctx.registerAnimation(animate);
  return () => {
    particles.length = 0;
  };
};

// ─── Registry ─────────────────────────────────────────────────────────────────
const PREVIEW_FACTORIES = {
  glitter: makeGlitterFactory,
  galaxy: makeGalaxyFactory,
  firefly: makeFireflyFactory,
  sakura: makeSakuraFactory,
  crystal: makeSnowflakeFactory,
  // ponytail: the real effect already reads ctx.scale, so the preview reuses it instead of a copy
  halloween: () => HalloweenEffectFactory,
};

// ─── Component ────────────────────────────────────────────────────────────────
const HoverEffectCanvas = ({ effectId, cardRef }) => {
  const canvasRef = useRef(null);
  const cleanupRef = useRef(null);
  const rafRef = useRef(null);
  const mouseRef = useRef({ x: 70, y: 45, px: 70, py: 45 });
  const needsEmitRef = useRef(false);

  const factoryFn = PREVIEW_FACTORIES[effectId];

  // Xử lý mousemove thật — tính tọa độ tương đối với canvas
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouseRef.current.px = mouseRef.current.x;
    mouseRef.current.py = mouseRef.current.y;
    mouseRef.current.x = (e.clientX - rect.left) * scaleX;
    mouseRef.current.y = (e.clientY - rect.top) * scaleY;
    needsEmitRef.current = true;
  }, []);

  const start = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !factoryFn) return;

    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    // Dùng canvas lớn hơn để hiệu ứng hiển thị rõ mà không phóng to particle
    canvas.width = 280;
    canvas.height = 180;

    mouseRef.current = { x: 140, y: 90, px: 140, py: 90 };

    // Scale = 1.0 giữ nguyên kích thước particle thật
    const SCALE = 1.0;

    const ctx = {
      canvas,
      mouseRef,
      needsEmitRef,
      rafRef,
      scale: SCALE,
      registerAnimation: (fn) => {
        const loop = () => {
          fn();
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      },
    };

    const factoryCleanup = factoryFn()(ctx) || null;

    canvas.addEventListener("mousemove", handleMouseMove);

    cleanupRef.current = () => {
      if (factoryCleanup) factoryCleanup();
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [factoryFn, handleMouseMove]);

  const stop = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx2 = canvas.getContext("2d");
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // Expose start/stop lên cardRef
  useEffect(() => {
    const node = cardRef?.current;
    if (!node) return;
    node._hoverCanvasStart = start;
    node._hoverCanvasStop = stop;
    return () => {
      delete node._hoverCanvasStart;
      delete node._hoverCanvasStop;
    };
  }, [start, stop, cardRef]);

  if (!factoryFn) return null;

  return (
    <canvas
      ref={canvasRef}
      width={140}
      height={90}
      className="w-full rounded-xl bg-black/30"
      aria-hidden="true"
    />
  );
};

export default HoverEffectCanvas;
