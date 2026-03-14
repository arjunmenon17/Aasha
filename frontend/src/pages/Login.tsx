import { useState, useEffect, useRef } from 'react';
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
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ORB_COLORS = ['#fecaca', '#fee2e2', '#ffc9d0', '#fbcfe8', '#fce7f3'];
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden bg-white">
      {/* Animated orbs + flowers */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {orbs.map((orb) => (
          <div
            key={orb.id}
            className="login-orb absolute rounded-full blur-3xl"
            style={{
              left: `${orb.left}%`,
              top: `${orb.top}%`,
              width: orb.size,
              height: orb.size,
              backgroundColor: orb.color,
              animationDelay: `${orb.delay}ms`,
            }}
          />
        ))}
        {flowers.map((f) => (
          <Flower key={f.id} left={f.left} top={f.top} size={f.size} />
        ))}
      </div>

      {/* Content on top */}
      <div
        className="relative z-10 flex flex-col items-center text-center"
        style={{ color: TEXT_COLOR }}
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
          Obstetric Monitoring for Clinicians
        </p>

        <button
          type="button"
          onClick={onEnter}
          className="relative z-10 px-10 py-3.5 rounded-xl bg-white border border-pregnancy font-medium text-sm tracking-wide hover:bg-pregnancy/5 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-[#B85050]/15"
          style={{
            fontFamily: 'Outfit, system-ui, sans-serif',
            color: BUTTON_TEXT_COLOR,
          }}
        >
          Login
        </button>
      </div>
    </div>
  );
}
