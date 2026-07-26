import { useRef, useEffect, useCallback, useState } from 'react';
import type { ElevationPoint } from '../elevation/api';
import './ElevationProfile.css';

interface ElevationProfileProps {
  points: ElevationPoint[];
  onHover: (point: ElevationPoint | null) => void;
}

function ElevationProfile({ points, onHover }: ElevationProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 20, right: 10, bottom: 20, left: 40 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    let minElev = Infinity;
    let maxElev = -Infinity;
    const maxDist = points[points.length - 1].dist;

    for (const p of points) {
      if (p.elev < minElev) minElev = p.elev;
      if (p.elev > maxElev) maxElev = p.elev;
    }

    const elevRange = maxElev - minElev || 1;

    function x(dist: number) {
      return pad.left + (dist / maxDist) * cw;
    }
    function y(elev: number) {
      return pad.top + ch - ((elev - minElev) / elevRange) * ch;
    }

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const ey = pad.top + (ch * i) / yTicks;
      ctx.beginPath();
      ctx.moveTo(pad.left, ey);
      ctx.lineTo(w - pad.right, ey);
      ctx.stroke();
    }

    const distTicks = 5;
    for (let i = 0; i <= distTicks; i++) {
      const dx = pad.left + (cw * i) / distTicks;
      ctx.beginPath();
      ctx.moveTo(dx, pad.top);
      ctx.lineTo(dx, h - pad.bottom);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(points[0].dist), y(points[0].elev));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(x(points[i].dist), y(points[i].elev));
    }
    ctx.stroke();

    ctx.lineTo(x(points[points.length - 1].dist), pad.top + ch);
    ctx.lineTo(x(points[0].dist), pad.top + ch);
    ctx.closePath();
    ctx.fill();

    if (cursorIdx !== null && cursorIdx < points.length) {
      const cx = x(points[cursorIdx].dist);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, pad.top + ch);
      ctx.stroke();
      ctx.setLineDash([]);

      const cx2 = x(points[cursorIdx].dist);
      const cy2 = y(points[cursorIdx].elev);
      ctx.fillStyle = '#3b82f6';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = '#666';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    for (let i = 0; i <= yTicks; i++) {
      const elev = minElev + (elevRange * i) / yTicks;
      const ey = pad.top + ch - (ch * i) / yTicks + 4;
      ctx.fillText(
        `${Math.round(elev * 3.28084).toLocaleString()} ft`,
        pad.left - 4,
        ey,
      );
    }

    ctx.textAlign = 'center';
    for (let i = 0; i <= distTicks; i++) {
      const d = (maxDist * i) / distTicks;
      const dx = pad.left + (cw * i) / distTicks;
      const ft = d * 3.28084;
      ctx.fillText(
        ft >= 5280
          ? `${(ft / 5280).toFixed(1)} mi`
          : `${Math.round(ft).toLocaleString()} ft`,
        dx,
        h - 2,
      );
    }
  }, [points, cursorIdx]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (points.length < 2) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pad = { left: 40, right: 10 };
      const cw = rect.width - pad.left - pad.right;
      const mx = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, (mx - pad.left) / cw));
      const maxDist = points[points.length - 1].dist;
      const targetDist = ratio * maxDist;

      let lo = 0;
      let hi = points.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (points[mid].dist < targetDist) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      if (
        lo > 0 &&
        targetDist - points[lo - 1].dist < points[lo].dist - targetDist
      ) {
        lo = lo - 1;
      }

      setCursorIdx(lo);
      onHover(points[lo]);
    },
    [points, onHover],
  );

  const handleMouseLeave = useCallback(() => {
    setCursorIdx(null);
    onHover(null);
  }, [onHover]);

  return (
    <div className="elevation-profile">
      <canvas
        ref={canvasRef}
        className="elevation-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}

export default ElevationProfile;
