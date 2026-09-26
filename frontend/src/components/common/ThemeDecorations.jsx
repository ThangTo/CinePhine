import React, { useEffect, useRef } from "react";

/**
 * ThemeDecorations - Hiển thị các decorations theo theme
 */
const ThemeDecorations = ({ theme }) => {
  const containerRef = useRef(null);
  const intervalRef = useRef(null);
  const fallingFlowerRef = useRef(null);
  const mouseMoveHandlerRef = useRef(null);
  const lastPetalTimeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Kiểm tra mobile
    const isMobile =
      window.innerWidth <= 768 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // --- CLEANUP ---
    const cleanup = () => {
      container.innerHTML = "";
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (fallingFlowerRef.current) clearInterval(fallingFlowerRef.current);
      if (mouseMoveHandlerRef.current) {
        document.removeEventListener("mousemove", mouseMoveHandlerRef.current);
      }
    };
    cleanup();

    if (isMobile && theme === "tet") return;

    try {
      if (theme === "tet") {
        // --- A. Cành cây (Giữ nguyên) ---
        const createBranches = () => {
          const leftBranch = document.createElement("div");
          leftBranch.className = "tet-branch branch-left";
          container.appendChild(leftBranch);

          const rightBranch = document.createElement("div");
          rightBranch.className = "tet-branch branch-right";
          container.appendChild(rightBranch);
        };
        createBranches();

        // --- HÀM XỬ LÝ KÉO THẢ (Nâng cấp để hỗ trợ Nổ Pháo) ---
        const attachDragEvent = (element, rope, anchor, originalHeight, onRelease = null) => {
          let isDragging = false;
          let maxPullReached = 0; // Theo dõi độ kéo căng

          const startDrag = (e) => {
            if (e.button !== 0 && e.type === "mousedown") return;
            isDragging = true;
            maxPullReached = 0;
            e.preventDefault();
            rope.style.animation = "none";
            rope.style.transition = "none";
            // Nếu là dây pháo thì tắt lắc lư khi đang kéo
            if (element.classList.contains("tet-firecracker-body-v2")) {
              element.style.animation = "none";
            }
          };

          const onDrag = (e) => {
            if (!isDragging) return;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const anchorRect = anchor.getBoundingClientRect();
            const anchorX = anchorRect.left + anchorRect.width / 2;
            const anchorY = anchorRect.top;

            const dx = clientX - anchorX;
            const dy = clientY - anchorY;

            // Tính góc xoay
            const angleRad = Math.atan2(dy, dx);
            const angleDeg = (angleRad * 180) / Math.PI - 90;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Giới hạn độ dài kéo
            const newHeight = Math.min(distance, 350);

            if (distance > maxPullReached) maxPullReached = distance;

            // Chỉ cho phép kéo xuống
            if (dy > -20) {
              rope.style.height = `${Math.max(newHeight, 20)}px`;
              rope.style.transform = `rotate(${angleDeg}deg)`;
              // Body không xoay riêng - chỉ di chuyển theo rope
              element.style.transform = `rotate(0deg)`;
            }
          };

          const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;

            // Kích hoạt NỔ nếu kéo đủ mạnh (>100px) và có hàm callback
            if (onRelease && maxPullReached > 100) {
              const rect = element.getBoundingClientRect();
              // Nổ ở vị trí đuôi
              onRelease(rect.left + rect.width / 2, rect.bottom - 20);
            }

            // Hiệu ứng nảy đàn hồi
            rope.style.transition =
              "height 0.6s cubic-bezier(0.5, -0.5, 0.2, 1.5), transform 0.8s cubic-bezier(0.3, 0, 0.3, 1)";
            rope.style.height = `${originalHeight}px`;
            rope.style.transform = "rotate(0deg)";

            element.style.transition = "transform 0.8s ease-out";
            element.style.transform = "rotate(0deg)"; // Body không xoay riêng

            setTimeout(() => {
              rope.style.transition = "";
              rope.style.animation = "";
              element.style.transition = "";
              // Body không có animation riêng, chỉ di chuyển theo rope
            }, 800);
          };

          element.addEventListener("mousedown", startDrag);
          element.addEventListener("touchstart", startDrag);
          window.addEventListener("mousemove", onDrag);
          window.addEventListener("mouseup", endDrag);
          window.addEventListener("touchmove", onDrag);
          window.addEventListener("touchend", endDrag);
        };

        // --- B. Lồng đèn (CODE CŨ GIỮ NGUYÊN) ---
        const createLanterns = () => {
          const totalLanterns = 6;
          for (let i = 0; i < totalLanterns; i++) {
            const isLeft = i < 3;
            const indexInSide = i % 3;
            const sideGap = 4 + indexInSide * 7; // Vị trí cũ: 4, 11, 18
            const initialHeight = isLeft ? [80, 60, 90][indexInSide] : [80, 60, 90][indexInSide];

            const anchor = document.createElement("div");
            anchor.className = "tet-lantern-anchor";
            anchor.style.cssText = `position: fixed; top: 0; ${
              isLeft ? "left" : "right"
            }: ${sideGap}%; z-index: 100001;`;

            const rope = document.createElement("div");
            rope.className = "tet-lantern-rope";
            rope.style.height = `${initialHeight + Math.random() * 10}px`;
            rope.style.animationDelay = `${Math.random() * 2}s`;

            const lantern = document.createElement("div");
            lantern.className = "tet-lantern-body";
            lantern.textContent = "🏮";
            lantern.style.fontSize = `${30 + Math.random() * 5}px`;

            const currentHeight = parseFloat(rope.style.height);
            attachDragEvent(lantern, rope, anchor, currentHeight);

            rope.appendChild(lantern);
            anchor.appendChild(rope);
            if (isMobile) anchor.style.display = "none";
            container.appendChild(anchor);
          }
        };

        // --- C. Bao Lì Xì (CODE CŨ GIỮ NGUYÊN) ---
        const createRedEnvelopes = () => {
          const positions = [7.5, 14.5]; // Vị trí cũ
          ["left", "right"].forEach((side) => {
            positions.forEach((pos) => {
              const anchor = document.createElement("div");
              anchor.className = "tet-lantern-anchor";
              anchor.style.cssText = `position: fixed; top: 0; ${side}: ${pos}%; z-index: 100001;`;

              const rope = document.createElement("div");
              rope.className = "tet-lantern-rope";
              const initialHeight = 50 + Math.random() * 20;
              rope.style.height = `${initialHeight}px`;
              rope.style.animationDelay = `${Math.random() * 2}s`;

              const envelope = document.createElement("div");
              envelope.className = "tet-red-envelope";
              envelope.innerHTML = `<div class="envelope-body"><span class="gold-text">Tết</span></div>`;

              attachDragEvent(envelope, rope, anchor, initialHeight);

              rope.appendChild(envelope);
              anchor.appendChild(rope);
              if (isMobile) anchor.style.display = "none";
              container.appendChild(anchor);
            });
          });
        };

        // --- NEW: DÂY PHÁO (THIẾT KẾ MỚI & HIỆU ỨNG NỔ) ---
        const createFirecrackers = () => {
          // Vị trí sát rìa (1%)
          const configs = [
            { side: "left", pos: 1.5 },
            { side: "right", pos: 1.5 },
          ];

          configs.forEach(({ side, pos }) => {
            const anchor = document.createElement("div");
            anchor.className = "tet-lantern-anchor";
            // Top 70px để nằm dưới cành cây, không bị khuất
            anchor.style.cssText = `position: fixed; top: 40px; ${side}: ${pos}%; z-index: 100002;`;

            const rope = document.createElement("div");
            rope.className = "tet-lantern-rope firecracker-rope"; // Style riêng cho dây
            const initialHeight = 240 + Math.random() * 40;
            rope.style.height = `${initialHeight}px`;

            // Body Pháo
            const body = document.createElement("div");
            body.className = "tet-firecracker-body-v2";

            // 1. Đỉnh: Hình thoi chữ Tết
            const diamond = document.createElement("div");
            diamond.className = "fc-diamond";
            diamond.innerHTML = "<span>Tết</span>";
            body.appendChild(diamond);

            // 2. Thân: Xương cá
            const main = document.createElement("div");
            main.className = "fc-main";
            const axis = document.createElement("div");
            axis.className = "fc-axis"; // Trục dây
            main.appendChild(axis);

            // 14 viên pháo
            for (let k = 0; k < 14; k++) {
              const tube = document.createElement("div");
              tube.className = "fc-tube-v2";
              tube.innerHTML = '<i class="band b-top"></i><i class="band b-bot"></i>';
              main.appendChild(tube);
            }
            body.appendChild(main);

            // // 3. Đuôi: 3 tua rua
            // const tail = document.createElement("div");
            // tail.className = "fc-tail-group";
            // for (let j = 0; j < 3; j++) {
            //   const t = document.createElement("div");
            //   t.className = `fc-tassel t-${j}`;
            //   tail.appendChild(t);
            // }
            // body.appendChild(tail);

            // Gắn sự kiện kéo -> Nổ
            attachDragEvent(body, rope, anchor, initialHeight, (x, y) => {
              createFireworkExplosion(x, y);
            });

            rope.appendChild(body);
            anchor.appendChild(rope);
            if (isMobile) anchor.style.display = "none";
            container.appendChild(anchor);
          });
        };

        // --- NEW: HIỆU ỨNG NỔ PHÁO ---
        const createFireworkExplosion = (x, y) => {
          const containerDiv = document.createElement("div");
          containerDiv.className = "tet-firework"; // Container tạm
          containerDiv.style.left = x + "px";
          containerDiv.style.top = y + "px";

          // 1. Chớp sáng (Flash)
          const flash = document.createElement("div");
          flash.className = "tet-flash";
          containerDiv.appendChild(flash);

          // 2. Tia lửa (Sparks)
          const colors = ["#ff0", "#f00", "#0f0", "#00f", "#fff"];
          for (let i = 0; i < 30; i++) {
            const spark = document.createElement("div");
            spark.className = "tet-spark";
            spark.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

            const angle = (Math.PI * 2 * i) / 30;
            const velocity = 60 + Math.random() * 60;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity;

            spark.style.setProperty("--tx", `${tx}px`);
            spark.style.setProperty("--ty", `${ty}px`);
            containerDiv.appendChild(spark);
          }
          container.appendChild(containerDiv);
          setTimeout(() => containerDiv.remove(), 1000);
        };

        // --- D. Hoa Tĩnh (CODE CŨ) ---
        const createStaticFlowers = () => {
          for (let i = 0; i < 7; i++) {
            const flower = document.createElement("div");
            flower.className = "tet-flower";
            flower.textContent = "🌸";
            flower.style.cssText = `position: fixed; font-size: ${
              20 + Math.random() * 20
            }px; left: ${Math.random() * 100}%; top: ${Math.random() * 80}%; opacity: ${
              0.3 + Math.random() * 0.4
            }; pointer-events: none; z-index: -1; animation: float-peach ${
              4 + Math.random() * 4
            }s ease-in-out infinite; animation-delay: ${Math.random() * 2}s;`;
            container.appendChild(flower);
          }
        };

        // --- E. Hoa Rơi (CODE CŨ) ---
        const createFallingFlower = () => {
          const petal = document.createElement("div");
          petal.innerHTML = `<svg width="20" height="20" viewBox="0 0 100 100" fill="none"><path d="M50 100 C 20 80 0 50 0 30 C 0 10 20 0 40 10 C 45 12 50 20 50 20 C 50 20 55 12 60 10 C 80 0 100 10 100 30 C 100 50 80 80 50 100 Z" fill="#FFB7C5" /></svg>`;
          petal.className = "tet-falling-flower";
          const size = 10 + Math.random() * 15;
          const leftPos = Math.random() * 100;
          const duration = 8 + Math.random() * 7;
          petal.style.cssText = `position: fixed; top: -20px; left: ${leftPos}%; width: ${size}px; height: ${size}px; opacity: ${
            0.6 + Math.random() * 0.4
          }; animation: tet-fall ${duration}s linear forwards; z-index: 1; pointer-events: none;`;
          container.appendChild(petal);
          setTimeout(() => {
            if (petal.parentNode) petal.remove();
          }, duration * 1000);
        };

        // --- F. Hoa theo chuột (CODE CŨ) ---
        const createMousePetal = (x, y) => {
          const petal = document.createElement("div");
          petal.className = "tet-cherry-blossom-mouse";
          petal.innerHTML = `<svg width="20" height="20" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 100 C 20 80 0 50 0 30 C 0 10 20 0 40 10 C 45 12 50 20 50 20 C 50 20 55 12 60 10 C 80 0 100 10 100 30 C 100 50 80 80 50 100 Z" fill="#FFB7C5" stroke="none" /></svg>`;
          const size = 12 + Math.random() * 15;
          const duration = 3 + Math.random() * 4;
          const randomX = (Math.random() - 0.5) * 50;
          const fallDistance = 200 + Math.random() * 300;
          petal.style.cssText = `position: fixed; width: ${size}px; height: ${size}px; left: ${x}px; top: ${y}px; opacity: ${
            0.6 + Math.random() * 0.3
          }; pointer-events: none; z-index: 2;`;
          petal.style.setProperty("--end-x", `${randomX}px`);
          petal.style.setProperty("--end-y", `${fallDistance}px`);
          petal.style.setProperty("--rotation", `${Math.random() * 360}deg`);
          petal.style.animation = `cherry-blossom-fall-from-mouse ${duration}s ease-out forwards`;
          container.appendChild(petal);
          setTimeout(() => {
            if (petal.parentNode) petal.remove();
          }, duration * 1000);
        };

        if (!isMobile) {
          mouseMoveHandlerRef.current = (e) => {
            const now = Date.now();
            if (now - lastPetalTimeRef.current >= 50) {
              lastPetalTimeRef.current = now;
              createMousePetal(e.clientX, e.clientY);
            }
          };
          document.addEventListener("mousemove", mouseMoveHandlerRef.current);
        }

        // --- G. Pháo hoa (Background - CODE CŨ) ---
        const createFirework = () => {
          const leftPos = 20 + Math.random() * 60;
          const topPos = 10 + Math.random() * 40;
          const firework = document.createElement("div");
          firework.className = "tet-firework";
          firework.style.cssText = `left: ${leftPos}%; top: ${topPos}%;`;
          const center = document.createElement("div");
          center.className = "tet-firework-center";
          firework.appendChild(center);
          const colors = [
            { main: "#fbbf24", trail: "#f59e0b" },
            { main: "#dc2626", trail: "#991b1b" },
            { main: "#ec4899", trail: "#db2777" },
            { main: "#22c55e", trail: "#16a34a" },
            { main: "#3b82f6", trail: "#2563eb" },
          ];
          const sparkCount = 12 + Math.floor(Math.random() * 9);
          const angleStep = (360 / sparkCount) * (Math.PI / 180);
          for (let i = 0; i < sparkCount; i++) {
            const angle = i * angleStep;
            const distance = 60 + Math.random() * 40;
            const sparkX = Math.cos(angle) * distance;
            const sparkY = Math.sin(angle) * distance;
            const colorSet = colors[Math.floor(Math.random() * colors.length)];
            const spark = document.createElement("div");
            spark.className = "tet-firework-spark";
            spark.style.cssText = `left: 50%; top: 50%; background: ${colorSet.main}; box-shadow: 0 0 6px ${colorSet.main};`;
            spark.style.setProperty("--spark-x", `${sparkX}px`);
            spark.style.setProperty("--spark-y", `${sparkY}px`);
            firework.appendChild(spark);
            const trail = document.createElement("div");
            trail.className = "tet-firework-trail";
            const trailAngle = (angle * 180) / Math.PI;
            trail.style.cssText = `left: 50%; top: 50%; background: linear-gradient(to bottom, ${colorSet.main} 0%, ${colorSet.trail} 50%, transparent 100%); box-shadow: 0 0 4px ${colorSet.main};`;
            trail.style.setProperty("--trail-x", `${sparkX * 0.3}px`);
            trail.style.setProperty("--trail-y", `${sparkY * 0.3}px`);
            trail.style.setProperty("--trail-angle", `${trailAngle}deg`);
            firework.appendChild(trail);
          }
          container.appendChild(firework);
          setTimeout(() => {
            if (firework.parentNode) firework.remove();
          }, 1200);
        };

        // --- INIT TET ---
        createFirecrackers(); // Pháo mới
        createLanterns();
        createRedEnvelopes();
        createStaticFlowers();

        createFirework();
        intervalRef.current = setInterval(() => {
          createFirework();
        }, 2000 + Math.random() * 2000);
        fallingFlowerRef.current = setInterval(() => {
          createFallingFlower();
        }, 2500 + Math.random() * 1000);
      }

      else if (theme === "newyear") {
        const createBalloon = () => {
          const balloon = document.createElement("div");
          balloon.className = "ny-balloon";
          balloon.textContent = ["🎈", "🎆", "🥂"][Math.floor(Math.random() * 3)];
          const leftPos = Math.random() * 100;
          const duration = 6 + Math.random() * 6;
          balloon.style.cssText = `left: ${leftPos}%; font-size: ${
            20 + Math.random() * 20
          }px; animation: ny-float-up ${duration}s ease-in forwards;`;
          container.appendChild(balloon);
          setTimeout(() => balloon.remove(), duration * 1000);
        };
        const createConfetti = () => {
          const colors = ["#FFD700", "#FF0000", "#00FF00", "#0000FF", "#FF00FF"];
          const conf = document.createElement("div");
          conf.className = "ny-confetti";
          conf.style.cssText = `left: ${Math.random() * 100}%; background: ${
            colors[Math.floor(Math.random() * colors.length)]
          }; animation: ny-confetti-fall ${3 + Math.random() * 2}s linear forwards;`;
          container.appendChild(conf);
          setTimeout(() => conf.remove(), 5000);
        };
        const createFloatingText = () => {
          const text = document.createElement("div");
          text.className = "ny-floating-text";
          text.textContent = "2026";
          text.style.left = Math.random() * 80 + 10 + "%";
          container.appendChild(text);
          setTimeout(() => text.remove(), 4000);
        };
        intervalRef.current = setInterval(() => {
          createBalloon();
          createConfetti();
          createConfetti();
          if (Math.random() > 0.95) createFloatingText();
        }, 400);
      }
    } catch (error) {
      console.error("Error ThemeDecorations:", error);
    }
    return cleanup;
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className={`theme-decorations ${theme}-container`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 100001,
        overflow: "hidden",
      }}
    />
  );
};

export default ThemeDecorations;
