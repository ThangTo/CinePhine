import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import useAuth from "hooks/useAuth";

export default function ChristmasCursorTrail() {
  const canvasRef = useRef(null);
  const { user } = useAuth();
  const { pathname } = useLocation();
  const equipped = user?.cursorEffectId;

  useEffect(() => {
    if ((equipped && equipped !== "none") || pathname.startsWith("/watch/")) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(any-pointer: fine)");
    let flakes = [];
    let frame = null;
    let lastFrame = 0;
    let lastEmit = -Infinity;
    let lastPoint = null;
    let width = 0;
    let height = 0;

    const clear = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      flakes = [];
      lastPoint = null;
      ctx.clearRect(0, 0, width, height);
    };
    const resize = () => {
      clear();
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now) => {
      frame = null;
      const dt = Math.min((now - lastFrame) / 1000, .05);
      lastFrame = now;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      let alive = 0;
      for (const flake of flakes) {
        const progress = (now - flake.born) / flake.life;
        if (progress >= 1) continue;
        flake.x += (flake.drift + Math.sin(now / 700 + flake.phase) * 5) * dt;
        flake.y += flake.speed * dt;
        ctx.globalAlpha = flake.opacity * Math.min(1, (1 - progress) / .45);
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fill();
        flakes[alive++] = flake;
      }
      flakes.length = alive;
      ctx.globalAlpha = 1;
      // Stop drawing completely after the last particle fades.
      if (alive) frame = requestAnimationFrame(draw);
    };
    const onMove = (event) => {
      if (event.pointerType !== "mouse" || reduced.matches || !finePointer.matches || document.hidden || document.fullscreenElement) return;
      if (event.target instanceof Element && event.target.closest("video, iframe, canvas, input, textarea, [contenteditable='true']")) {
        lastPoint = null;
        return;
      }
      const now = performance.now();
      if (now - lastEmit < 16) return;
      const point = { x: event.clientX, y: event.clientY };
      const start = lastPoint && now - lastEmit < 160 ? lastPoint : point;
      const distance = Math.hypot(point.x - start.x, point.y - start.y);
      if (start === lastPoint && distance < 2) return;
      const amount = Math.min(8, Math.max(2, Math.ceil(distance / 7)));
      for (let i = 1; i <= amount; i++) {
        flakes.push({
          x: start.x + (point.x - start.x) * i / amount + (Math.random() - .5) * 12,
          y: start.y + (point.y - start.y) * i / amount + (Math.random() - .5) * 10,
          radius: .8 + Math.random() * 1.6,
          speed: 17 + Math.random() * 15,
          drift: (Math.random() - .5) * 10,
          phase: Math.random() * Math.PI * 2,
          opacity: .55 + Math.random() * .4,
          born: now,
          life: 2100 + Math.random() * 700,
        });
      }
      lastPoint = point;
      lastEmit = now;
      if (frame === null) {
        lastFrame = now;
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", clear);
    document.addEventListener("fullscreenchange", clear);
    reduced.addEventListener("change", clear);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", clear);
      document.removeEventListener("fullscreenchange", clear);
      reduced.removeEventListener("change", clear);
      clear();
    };
  }, [equipped, pathname]);

  return <canvas ref={canvasRef} className="winter-cursor-trail" aria-hidden="true" />;
}
