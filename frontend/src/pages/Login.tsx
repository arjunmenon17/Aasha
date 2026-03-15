import { useState, useEffect, useRef, type MouseEvent, type FormEvent } from 'react';
import { Flower } from '@/components/login/Flower';
import { authApi } from '@/api';

interface LoginProps {
  onEnter: (accessToken: string) => void;
}

const TEXT_COLOR = '#000000'; // black
const BUTTON_TEXT_COLOR = '#0f172a';
const JOIN_US_EMAIL = 'hello@aasha.health';
const JOIN_US_PHONE = '+254700111222';

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

type StoryStop = {
  label: string;
  title: string;
  lines: string[];
  images: { src: string; alt: string; label?: string }[];
  accent: string;
};

const STORY_STOPS: StoryStop[] = [
  {
    label: 'Problem',
    title: 'The gap',
    lines: [
      'Rachel Coyle is a midwife working in rural Yemen, responsible for mothers across villages miles apart.',
      'But she cannot be everywhere at once.',
      'Between visits, warning signs can appear - and the delay can be dangerous.',
    ],
    images: [{ src: '/yemen.png', alt: 'Photo of a Yemeni midwife' }],
    accent: '#f97373',
  },
  {
    label: 'Solution',
    title: 'The signal',
    lines: [
      'Aasha turns simple SMS messages into early warnings.',
      'Mothers can report symptoms using basic text messages - no smartphone, no app, no internet.',
      'Healthcare workers can quickly see who may need attention first.',
    ],
    images: [
      { src: '/text.png', alt: 'SMS texting interface', label: 'SMS' },
      { src: '/calendar.png', alt: 'Calendar tracking feature', label: 'Calendar' },
      { src: '/map.png', alt: 'Map feature', label: 'Map' },
      { src: '/details.png', alt: 'Patient details dashboard', label: 'Details' },
    ],
    accent: '#fb7185',
  },
  {
    label: 'Mission',
    title: 'The reason',
    lines: [
      'Early warning signs save lives.',
      'Aasha exists to make sure those signals are heard - even in low-resource settings.',
      'Because earlier signals mean earlier care.',
    ],
    images: [{ src: '/aasha.png', alt: 'Aasha mission mark' }],
    accent: '#14b8a6',
  },
];

export function Login({ onEnter }: LoginProps) {
  const [flowers, setFlowers] = useState<{ id: number; left: number; top: number; size: number }[]>([]);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });
  const [hovering, setHovering] = useState(false);
  const [publicPath, setPublicPath] = useState<'/' | '/about' | '/login'>(() => {
    if (typeof window === 'undefined') return '/';
    if (window.location.pathname === '/about') return '/about';
    if (window.location.pathname === '/login') return '/login';
    return '/';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showJoinUs, setShowJoinUs] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const [activeStop, setActiveStop] = useState(0);
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ORB_COLORS = ['#fde4e8', '#fecaca', '#fce7f3', '#fef2f4', '#fdf2f8'];
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

  const setPublicRoute = (path: '/' | '/about' | '/login') => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setPublicPath(path);
  };

  const scrollToAbout = () => {
    setPublicRoute('/about');
    aboutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const scrollToTop = () => {
    setPublicRoute('/');
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleLoginSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setAuthError(null);
    if (!username.trim() || !password) {
      setAuthError('Please enter username and password');
      return;
    }
    setAuthLoading(true);
    try {
      const result = await authApi.login(username.trim(), password);
      onEnter(result.access_token);
    } catch {
      setAuthError('Invalid username or password');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncSectionFromPath = () => {
      const path =
        window.location.pathname === '/about'
          ? '/about'
          : window.location.pathname === '/login'
            ? '/login'
            : '/';
      setPublicPath(path);

      if (path === '/about') {
        requestAnimationFrame(() => {
          aboutRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
      } else if (path === '/') {
        requestAnimationFrame(() => {
          heroRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
      }
    };

    syncSectionFromPath();
    window.addEventListener('popstate', syncSectionFromPath);
    return () => window.removeEventListener('popstate', syncSectionFromPath);
  }, []);

  if (publicPath === '/login') {
    return (
      <div
        className="h-screen overflow-hidden bg-white relative"
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
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

        <div className="relative z-10 h-full flex items-center justify-center px-4">
          <button
            type="button"
            onClick={() => setShowJoinUs(true)}
            className="absolute top-6 right-6 text-xs sm:text-sm font-medium px-4 py-2 rounded-full border border-slate-300/90 bg-white/85 text-slate-700 hover:bg-white transition"
          >
            Join Us
          </button>
          <form
            onSubmit={handleLoginSubmit}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-sm p-6 shadow-xl"
          >
            <img src="/aasha.png" alt="Aasha" className="h-14 w-auto object-contain mb-3 mx-auto" />
            <h2 className="text-2xl font-semibold text-slate-900 text-center" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
              Sign in
            </h2>
            <p className="text-sm text-slate-500 mt-1 text-center">Enter your dashboard credentials</p>

            <label className="block mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-pregnancy/30"
              autoComplete="username"
              autoFocus
            />

            <label className="block mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-pregnancy/30"
              autoComplete="current-password"
            />

            {authError && (
              <div className="mt-3 text-sm text-red-600">{authError}</div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="mt-4 w-full px-4 py-2.5 text-sm rounded-lg bg-pregnancy text-white hover:bg-pregnancy-dark disabled:opacity-60"
            >
              {authLoading ? 'Signing in...' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={scrollToTop}
              className="mt-3 w-full text-sm text-slate-600 hover:text-slate-900"
            >
              Back to Home
            </button>
          </form>
        </div>

        {showJoinUs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShowJoinUs(false)} aria-hidden />
            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <h3 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
                Join Aasha
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Because Aasha handles sensitive maternal health information, onboarding requires a brief application and
                verification process with our team.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Contact us to start your application:
              </p>
              <div className="mt-4 space-y-2">
                <a
                  href={`mailto:${JOIN_US_EMAIL}`}
                  className="block rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
                >
                  Email: {JOIN_US_EMAIL}
                </a>
                <a
                  href={`tel:${JOIN_US_PHONE}`}
                  className="block rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
                >
                  Call: {JOIN_US_PHONE}
                </a>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinUs(false)}
                className="mt-5 w-full rounded-lg bg-pregnancy text-white py-2.5 text-sm font-medium hover:bg-pregnancy-dark transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
            onClick={() => setPublicRoute('/login')}
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
            onClick={() => setShowJoinUs(true)}
            className="relative z-10 mt-3 px-8 py-2.5 rounded-xl bg-white/85 border border-slate-300 text-slate-700 text-sm font-medium tracking-wide hover:bg-white transition-all duration-200"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
          >
            Join Us
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

      {/* Section 2: About page — one-screen horizontal trail */}
      <section
        ref={aboutRef}
        className="min-h-screen px-4 sm:px-6 py-6 sm:py-8 bg-gradient-to-b from-[#fff8f6] via-[#fffaf7] to-[#f6fbf8] relative snap-start snap-always overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-16 top-16 w-60 h-60 rounded-full bg-[#ffd8cf] blur-3xl opacity-35" />
          <div className="absolute right-0 top-24 w-64 h-64 rounded-full bg-[#fbcfe8] blur-3xl opacity-30" />
          <div className="absolute left-1/3 bottom-[-100px] w-72 h-72 rounded-full bg-[#d6f1df] blur-3xl opacity-30" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto h-full flex flex-col">
          <div className="text-center mb-4 sm:mb-5">
            <h2
              className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              The path to earlier care
            </h2>
          </div>

          {/* Unified carousel */}
          <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
            <div className="mx-auto mb-4 inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 backdrop-blur-sm p-1 shadow-sm">
              {STORY_STOPS.map((stop, idx) => (
                <button
                  key={stop.label}
                  type="button"
                  onClick={() => setActiveStop(idx)}
                  className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition ${
                    idx === activeStop ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
                  }`}
                  style={idx === activeStop ? { backgroundColor: stop.accent } : undefined}
                >
                  {stop.label}
                </button>
              ))}
            </div>

            <div className="relative min-h-[36rem] sm:min-h-[40rem]">
              <button
                type="button"
                onClick={() => setActiveStop((s) => (s - 1 + STORY_STOPS.length) % STORY_STOPS.length)}
                className="absolute -left-8 sm:-left-12 md:-left-16 top-1/2 -translate-y-1/2 z-20 inline-flex items-center justify-center w-12 h-12 rounded-full border border-slate-200 bg-white/90 backdrop-blur-sm text-slate-700 hover:text-slate-900 hover:shadow-md transition-all"
                aria-label="Previous section"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <article className="px-14 sm:px-20 md:px-24 py-4 sm:py-5 h-full">
                <div
                  className="text-[0.65rem] uppercase tracking-[0.2em] font-semibold"
                  style={{ color: STORY_STOPS[activeStop].accent }}
                >
                  {STORY_STOPS[activeStop].label}
                </div>
                <h3 className="mt-1 text-3xl sm:text-4xl font-semibold text-slate-900">{STORY_STOPS[activeStop].title}</h3>

                {activeStop === 1 ? (
                  <div className="mt-4 relative min-h-[22rem] sm:min-h-[27rem]">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto max-w-[33rem] text-center px-6">
                      {STORY_STOPS[activeStop].lines.map((line) => (
                        <p key={line} className="mt-2 text-base sm:text-lg leading-relaxed text-slate-700">
                          {line}
                        </p>
                      ))}
                    </div>

                    {[
                      { pos: 'left-0 top-1 sm:left-4 sm:top-2', rot: '-rotate-6' },
                      { pos: 'right-0 top-1 sm:right-4 sm:top-2', rot: 'rotate-6' },
                      { pos: 'left-0 bottom-1 sm:left-4 sm:bottom-2', rot: 'rotate-3' },
                      { pos: 'right-0 bottom-1 sm:right-4 sm:bottom-2', rot: '-rotate-3' },
                    ].map((style, idx) => {
                      const item = STORY_STOPS[activeStop].images[idx];
                      return (
                        <div key={item.src} className={`absolute ${style.pos} ${style.rot} w-44 sm:w-52 lg:w-56`}>
                          <img
                            src={item.src}
                            alt={item.alt}
                            className="h-28 sm:h-32 lg:h-36 w-full object-contain drop-shadow-[0_10px_20px_rgba(15,23,42,0.18)]"
                          />
                          <div className="mt-1 text-[0.62rem] uppercase tracking-wide text-slate-600 font-semibold text-center">
                            {item.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {STORY_STOPS[activeStop].lines.map((line) => (
                      <p key={line} className="mt-2 text-base sm:text-lg leading-relaxed text-slate-700">
                        {line}
                      </p>
                    ))}
                    <img
                      src={STORY_STOPS[activeStop].images[0].src}
                      alt={STORY_STOPS[activeStop].images[0].alt}
                      className="mt-4 h-44 sm:h-56 w-full object-contain"
                    />
                  </>
                )}
              </article>

              <button
                type="button"
                onClick={() => setActiveStop((s) => (s + 1) % STORY_STOPS.length)}
                className="absolute -right-8 sm:-right-12 md:-right-16 top-1/2 -translate-y-1/2 z-20 inline-flex items-center justify-center w-12 h-12 rounded-full border border-slate-200 bg-white/90 backdrop-blur-sm text-slate-700 hover:text-slate-900 hover:shadow-md transition-all"
                aria-label="Next section"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>

            <div className="mt-2 flex items-center justify-center gap-2">
              {STORY_STOPS.map((stop, idx) => (
                <button
                  key={stop.label}
                  type="button"
                  onClick={() => setActiveStop(idx)}
                  className={`h-2.5 rounded-full transition-all ${idx === activeStop ? 'w-8' : 'w-2.5 bg-slate-300'}`}
                  style={idx === activeStop ? { backgroundColor: stop.accent } : undefined}
                  aria-label={`Go to ${stop.label}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={scrollToTop}
            className="mt-5 sm:mt-6 mx-auto flex flex-col items-center bg-transparent border-none text-slate-600 hover:text-slate-900 cursor-pointer font-medium text-sm tracking-wide transition-colors duration-200 outline-none focus:ring-0 focus:outline-none"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            aria-label="Home — scroll to top"
          >
            <span className="flex flex-col items-center mb-1" aria-hidden>
              <span className="text-[8px] leading-none mb-0.5">▲</span>
              <span className="w-px h-5 bg-current opacity-70" />
            </span>
            <span>Home</span>
          </button>
        </div>
      </section>

      {showJoinUs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/35" onClick={() => setShowJoinUs(false)} aria-hidden />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
              Join Aasha
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Because Aasha handles sensitive maternal health information, onboarding requires a brief application and
              verification process with our team.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Contact us to start your application:
            </p>
            <div className="mt-4 space-y-2">
              <a
                href={`mailto:${JOIN_US_EMAIL}`}
                className="block rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
              >
                Email: {JOIN_US_EMAIL}
              </a>
              <a
                href={`tel:${JOIN_US_PHONE}`}
                className="block rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
              >
                Call: {JOIN_US_PHONE}
              </a>
            </div>
            <button
              type="button"
              onClick={() => setShowJoinUs(false)}
              className="mt-5 w-full rounded-lg bg-pregnancy text-white py-2.5 text-sm font-medium hover:bg-pregnancy-dark transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
