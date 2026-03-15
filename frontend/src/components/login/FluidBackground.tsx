import { useEffect, useRef } from 'react';
import WebGLFluidEnhanced from 'webgl-fluid-enhanced';

// HEXtoRGB in this library returns raw 0-255 bytes, so passing explicit hex
// colors to splatAtLocation blows them out (×10 → R=1900, pure white).
// Instead we set colorPalette here and let generateColor handle normalization
// through HSV — it correctly applies brightness as the V channel before ×10.
const PALETTE = [
  '#be123c', // rose-700
  '#9f1239', // rose-800
  '#B85050', // pregnancy rose
  '#c2185b', // pink-800
  '#881337', // rose-900
];

export function FluidBackground() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<WebGLFluidEnhanced | null>(null);
  const lastPos = useRef({ x: -1, y: -1 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let sim: WebGLFluidEnhanced;
    try {
      sim = new WebGLFluidEnhanced(container);
      sim.setConfig({
        dyeResolution: 256,
        simResolution: 64,
        densityDissipation: 0.996,
        velocityDissipation: 0.999,
        pressure: 0.05,
        pressureIterations: 4,
        curl: 20,
        splatRadius: 2.6,
        splatForce: 800,
        shading: false,
        colorful: false,
        colorPalette: PALETTE,
        brightness: 0.006,   // V channel in HSV — controls how dark/vivid the dye is
        hover: false,
        backgroundColor: '#fff2f8',
        transparent: false,
        bloom: false,
        sunrays: false,
      });
      sim.start();
      simRef.current = sim;
    } catch {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    const handleMouseMove = (e: MouseEvent) => {
      const s = simRef.current;
      if (!s) return;

      if (lastPos.current.x === -1) {
        lastPos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 1) return;

      // Interpolate a splat every 6px — continuous trail without too many calls
      const steps = Math.max(1, Math.ceil(dist / 12));
      const vx =  dx * 0.04;
      const vy = -dy * 0.04;

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = (lastPos.current.x + dx * t) * dpr;
        const py =  lastPos.current.y + dy * t;
        // No explicit color arg — library uses colorPalette + brightness via generateColor
        s.splatAtLocation(px, py, vx, vy);
      }

      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const s = simRef.current;
      if (!s) return;
      Array.from(e.changedTouches).forEach((touch) => {
        s.splatAtLocation(touch.clientX * dpr, touch.clientY, 0.02, -0.02);
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('touchmove', handleTouchMove);
      simRef.current?.stop();
      simRef.current = null;
      lastPos.current = { x: -1, y: -1 };
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
