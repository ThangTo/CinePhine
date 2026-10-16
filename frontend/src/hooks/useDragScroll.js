import { useRef } from "react";

/**
 * Click-and-drag horizontal scrolling for mouse users (touch already scrolls natively).
 * Spread the returned handlers on the scroll container.
 */
export default function useDragScroll() {
  const draggedRef = useRef(false);

  const onMouseDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault(); // no text selection or native link/image drag
    const el = event.currentTarget;
    const startX = event.clientX;
    const startLeft = el.scrollLeft;
    draggedRef.current = false;
    el.style.cursor = "grabbing";

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!draggedRef.current && Math.abs(dx) < 5) return;
      draggedRef.current = true;
      el.style.scrollSnapType = "none"; // snapping fights per-pixel scrollLeft writes
      el.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      el.style.cursor = "";
      el.style.scrollSnapType = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // A drag released over a chip or card must not also click it.
  const onClickCapture = (event) => {
    if (!draggedRef.current) return;
    draggedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { onMouseDown, onClickCapture };
}
