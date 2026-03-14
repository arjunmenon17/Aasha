import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { Flower } from '@/components/login/Flower';

interface LoginProps {
  onEnter: () => void;
}

const TEXT_COLOR = '#000000'; // black
const BUTTON_TEXT_COLOR = '#0f172a';

const MAX_FLOWERS = 12;
const FLOWER_SPAWN_INTERVAL_MS = 2600;
const FLOWER_DURATION_MS = 5200;
const ORB_DURATION_MS = 28000;

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function repelPoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
  strength: number
) {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.hypot(dx, dy);
  if (dist >= radius || dist === 0) {
    return { left: px, top: py };
  }

  const influence = (radius - dist) / radius;
  const push = influence * strength;
  const ux = dx / dist;
  const uy = dy / dist;

  return {
    left: clamp(px + ux * push, 2, 98),
    top: clamp(py + uy * push, 2, 98),
  };
}

// Avoid flowers overlapping the central content block
// Forbidden zone is approximate: middle 40% horizontally and 40% vertically.
function randomPositionAvoidingCenter() {
  const MAX_ATTEMPTS = 8;
  let left = 0;
  let top = 0;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    left = randomInRange(8, 92);
    top = randomInRange(12, 88);
    const inCenterX = left > 30 && left < 70;
    const inCenterY = top > 30 && top < 70;
    if (!(inCenterX && inCenterY)) {
      return { left, top };
    }
  }
  // Fallback: clamp out of the center horizontally
  if (left > 50) {
    left = 72;
  } else {
    left = 28;
  }
  return { left, top };
}

export function Login({ onEnter }: LoginProps) {
  const [flowers, setFlowers] = useState<{ id: number; left: number; top: number; size: number }[]>([]);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });
  const [hovering, setHovering] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ORB_COLORS = ['#fda4af', '#fb7185', '#f9a8d4', '#fecdd3', '#fbcfe8'];
  const [orbs, setOrbs] = useState<
    { id: number; left: number; top: number; size: number; color: string; delay: number }[]
  >(() => {
    const count = 16;
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      left: randomInRange(5, 75),
      top: randomInRange(5, 75),
      size: 180 + Math.random() * 380,
      color: ORB_COLORS[i % ORB_COLORS.length],
      delay: Math.floor((i / count) * ORB_DURATION_MS * 0.6),
    }));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setFlowers((prev) => {
        if (prev.length >= MAX_FLOWERS) return prev;
        const id = ++idRef.current;
        const { left, top } = randomPositionAvoidingCenter();
        const size = 22 + Math.random() * 24;
        const t = setTimeout(() => {
          setFlowers((f) => f.filter((x) => x.id !== id));
        }, FLOWER_DURATION_MS);
        timeoutsRef.current.push(t);
        return [...prev, { id, left, top, size }];
      });
    }, FLOWER_SPAWN_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  // Every orb loop, randomize orb start positions and delays so they
  // reappear in new spots and fade back in at different times.
  useEffect(() => {
    const interval = setInterval(() => {
      setOrbs((prev) => {
        const count = prev.length || 16;
        return prev.map((orb, i) => ({
          ...orb,
          left: randomInRange(5, 75),
          top: randomInRange(5, 75),
          delay: Math.floor((i / count) * ORB_DURATION_MS * 0.6),
        }));
      });
    }, ORB_DURATION_MS);

    return () => clearInterval(interval);
  }, []);

  const contentShiftX = (cursor.x - 50) * -0.14;
  const contentShiftY = (cursor.y - 50) * -0.1;
  const orbsShiftX = (cursor.x - 50) * 0.1;
  const orbsShiftY = (cursor.y - 50) * 0.08;
  const repelRadius = 11;
  const repelStrength = 8;

  const handleMouseMove = (ev: MouseEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 100;
    const y = ((ev.clientY - rect.top) / rect.height) * 100;
    setCursor({ x, y });
  };

  const scrollToAbout = () => {
    aboutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const scrollToTop = () => {
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className="h-screen overflow-y-auto overflow-x-hidden bg-white snap-y snap-mandatory scrollbar-hide"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Section 1: Hero */}
      <section
        ref={heroRef}
        className="min-h-screen flex flex-col items-center justify-center px-6 relative snap-start snap-always"
      >
        {/* Animated orbs + flowers — extended bounds so no visible edge when moving cursor */}
        <div
          className="absolute pointer-events-none overflow-hidden -top-[45%] -left-[20%] -right-[20%] -bottom-[20%]"
          style={{
            transform: `translate3d(${orbsShiftX}px, ${orbsShiftY}px, 0)`,
          }}
        >
          {orbs.map((orb) => {
            const p = hovering
              ? repelPoint(orb.left, orb.top, cursor.x, cursor.y, repelRadius, repelStrength)
              : { left: orb.left, top: orb.top };
            return (
              <div
                key={orb.id}
                className="login-orb absolute rounded-full blur-3xl"
                style={{
                  left: `${p.left}%`,
                  top: `${p.top}%`,
                  width: orb.size,
                  height: orb.size,
                  backgroundColor: orb.color,
                  animationDelay: `${orb.delay}ms`,
                  transition: 'left 90ms ease-out, top 90ms ease-out',
                }}
              />
            );
          })}
          {flowers.map((f) => {
            const p = hovering
              ? repelPoint(f.left, f.top, cursor.x, cursor.y, repelRadius, repelStrength + 4)
              : { left: f.left, top: f.top };
            return <Flower key={f.id} left={p.left} top={p.top} size={f.size} />;
          })}
        </div>

        <div
          className="absolute inset-0 pointer-events-none z-[2]"
          style={{
            background: `radial-gradient(480px circle at ${cursor.x}% ${cursor.y}%, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0) 60%)`,
          }}
        />

        {/* Hero content */}
        <div
          className="relative z-10 flex flex-col items-center text-center"
          style={{
            color: TEXT_COLOR,
            transform: `translate3d(${contentShiftX}px, ${contentShiftY}px, 0)`,
            transition: 'transform 80ms ease-out',
          }}
        >
          <img
            src="/aasha.png"
            alt="Aasha"
            className="h-20 sm:h-24 md:h-28 w-auto mb-3 object-contain"
          />
          <h1
            className="text-6xl sm:text-7xl md:text-8xl font-bold tracking-[0.35em] uppercase mb-2"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif', color: TEXT_COLOR }}
          >
            AASHA
          </h1>
          <p
            className="text-sm tracking-[0.3em] uppercase mb-10 font-medium"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif', color: TEXT_COLOR }}
          >
            Monitoring Pregnancies Beyond the Clinic
          </p>

          <button
            type="button"
            onClick={onEnter}
            className="relative z-10 px-10 py-3.5 rounded-xl bg-white border border-pregnancy font-medium text-sm tracking-wide hover:bg-pregnancy/5 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-[#B85050]/15"
            style={{
              fontFamily: 'Outfit, system-ui, sans-serif',
              color: BUTTON_TEXT_COLOR,
              transform: `translate3d(${(cursor.x - 50) * -0.05}px, ${(cursor.y - 50) * -0.04}px, 0)`,
            }}
          >
            Login
          </button>

          <button
            type="button"
            onClick={scrollToAbout}
            className="relative z-10 mt-6 flex flex-col items-center bg-transparent border-none text-slate-600 hover:text-slate-900 cursor-pointer font-medium text-sm tracking-wide transition-colors duration-200 outline-none focus:ring-0 focus:outline-none"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            aria-label="About Aasha — scroll to summary"
          >
            <span>About</span>
            <span className="flex flex-col items-center mt-1" aria-hidden>
              <span className="w-px h-5 bg-current opacity-70" />
              <span className="text-[8px] leading-none mt-0.5">▼</span>
            </span>
          </button>
        </div>
      </section>

      {/* Section 2: About page */}
      <section
        ref={aboutRef}
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-slate-50/80 snap-start snap-always"
      >
        <div className="w-full max-w-lg text-center">
          <h2
            className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mb-6"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
          >
            About Aasha
          </h2>
          <p
            className="text-slate-700 text-base sm:text-lg leading-relaxed mb-10"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
          >
            <strong className="text-slate-900">Aasha</strong> helps community healthcare workers monitor pregnant and
            postpartum women in low-resource settings. Mothers report symptoms via <strong>simple SMS</strong> on a basic
            phone—no smartphone or internet needed. The system turns those messages into structured risk signals so
            healthcare workers can see who needs follow-up first and bridge the gap between in-person visits.
          </p>
          <button
            type="button"
            onClick={scrollToTop}
            className="flex flex-col items-center bg-transparent border-none text-slate-600 hover:text-slate-900 cursor-pointer font-medium text-sm tracking-wide transition-colors duration-200 outline-none focus:ring-0 focus:outline-none mx-auto"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            aria-label="Back to top"
          >
            <span className="flex flex-col items-center mb-1" aria-hidden>
              <span className="text-[8px] leading-none mb-0.5">▲</span>
              <span className="w-px h-5 bg-current opacity-70" />
            </span>
            <span>Back</span>
          </button>
        </div>
      </section>
    </div>
  );
}
