import { useRef, useState } from "react";
import type { Point } from "../../packages/domain";
import {
  appendDrawingPoint,
  simplifyDrawing,
} from "../../packages/domain/drawing";
export function DrawOverlay({
  unproject,
  onDraw,
}: {
  unproject: (x: number, y: number) => Point | null;
  onDraw: (line: [number, number][]) => void;
}) {
  const points = useRef<Point[]>([]),
    active = useRef<number | null>(null),
    [pixels, setPixels] = useState<[number, number][]>([]);
  return (
    <svg
      className="draw-overlay"
      aria-label="Área para desenhar o trajeto"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 5,
        touchAction: "none",
        cursor: "crosshair",
      }}
      onPointerDown={(e) => {
        if (active.current !== null || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        points.current = [];
        setPixels([]);
        const r = e.currentTarget.getBoundingClientRect(),
          x = e.clientX - r.left,
          y = e.clientY - r.top,
          p = unproject(x, y);
        if (p) {
          points.current = [p];
          setPixels([[x, y]]);
        }
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return;
        const r = e.currentTarget.getBoundingClientRect(),
          x = e.clientX - r.left,
          y = e.clientY - r.top,
          p = unproject(x, y);
        if (p && points.current.length < 3000) {
          points.current = appendDrawingPoint(points.current, p);
          setPixels((v) => [...v.slice(-2999), [x, y]]);
        }
      }}
      onPointerUp={(e) => {
        if (active.current !== e.pointerId) return;
        active.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        const result = simplifyDrawing(points.current);
        setPixels([]);
        points.current = [];
        if (result.length >= 2) onDraw(result);
      }}
      onPointerCancel={() => {
        active.current = null;
        points.current = [];
        setPixels([]);
      }}
    >
      <polyline
        points={pixels.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="#FDE047"
        strokeWidth="5"
        strokeDasharray="8 5"
      />
    </svg>
  );
}
