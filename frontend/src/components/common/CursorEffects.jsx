/**
 * CursorEffects — Main canvas + provider wrapper.
 * Đặt ở App.js level, chạy toàn trang.
 */
import React, { useRef } from "react";
import { CursorEffectProvider } from "contexts/CursorEffectContext";

// Import effects để trigger register
import "effects/glitter";
import "effects/galaxy";
import "effects/firefly";
import "effects/crystal";
import "effects/sakura";
import "effects/halloween";

const CursorEffects = ({ activeEffectId }) => {
  const canvasRef = useRef(null);

  if (!activeEffectId || activeEffectId === "none") return null;

  return (
    <CursorEffectProvider activeEffectId={activeEffectId} canvasRef={canvasRef}>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100dvh",
          pointerEvents: "none",
          zIndex: 99998,
          mixBlendMode: "screen",
        }}
        aria-hidden="true"
      />
    </CursorEffectProvider>
  );
};

export default CursorEffects;
