import { useState, useEffect, useRef, type MouseEvent, type FormEvent } from 'react';
import { Flower } from '@/components/login/Flower';
import { FluidBackground } from '@/components/login/FluidBackground';
import { authApi } from '@/api/auth';

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

const IMPACT_POINTS = [
  {
    title: 'Works on basic phones',
    body: 'Mothers use simple SMS. No app, no smartphone, no internet required.',
  },
  {
    title: 'Flags risk earlier',
    body: 'Symptoms are tracked and assessed continuously, not only during clinic visits.',
  },
  {
    title: 'Helps teams act faster',
    body: 'Doctors and health workers can prioritize urgent patients before conditions escalate.',
  },
];

const WHY_AASHA_IMAGES = [
  {
    src: '/text.png',
    alt: 'SMS check-in conversation view',
    label: 'SMS Check-ins',
  },
  {
    src: '/calendar.png',
    alt: 'Scheduled monitoring and follow-up timeline',
    label: 'Consistent Monitoring',
  },
  {
    src: '/map.png',
    alt: 'Aasha dashboard route and risk overview',
    label: 'Risk-Aware Routing',
  },
];

export function Login({ onEnter }: LoginProps) {
  const [flowers, setFlowers] = useState<{ id: number; left: number; top: number; size: number }[]>([]);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });
  const [hovering, setHovering] = useState(false);
  const [activeWhyImage, setActiveWhyImage] = useState(0);
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
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Kept very pale so the orbs act as soft diffusion layers above the fluid
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
        {/* WebGL fluid simulation — sits behind all other layers */}
        <FluidBackground />

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
            Equal Care for All
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

      {/* Section 2: About page */}
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
          <div className="text-center mb-4 sm:mb-6">
            <h2
              className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              No mother should be invisible between clinic visits.
            </h2>
            <p className="mt-3 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
              Aasha turns simple SMS check-ins into early warning signals, helping care teams identify
              who needs attention first and act before complications become emergencies.
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <article className="w-full max-w-5xl rounded-3xl border border-white/70 bg-white/75 backdrop-blur-sm shadow-[0_20px_60px_rgba(15,23,42,0.08)] px-6 sm:px-10 py-7 sm:py-10">
              <div className="grid md:grid-cols-[1.3fr_1fr] gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/70 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-rose-700 font-semibold">
                    Why Aasha
                  </div>
                  <h3 className="mt-4 text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight">
                    Earlier signals. Faster care. Safer pregnancies.
                  </h3>
                  <p className="mt-3 text-slate-600 leading-relaxed text-[15px] sm:text-base">
                    In low-resource settings, risk can rise between visits. Aasha keeps a continuous
                    connection through SMS so health workers can prioritize high-risk mothers sooner.
                  </p>

                  <ul className="mt-5 space-y-3">
                    {IMPACT_POINTS.map((point) => (
                      <li key={point.title} className="flex items-start gap-3">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-rose-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{point.title}</p>
                          <p className="text-sm text-slate-600 leading-relaxed">{point.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="relative">
                  <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-rose-100/70 to-emerald-100/60 blur-2xl" />
                  <div className="relative rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
                    <div className="relative rounded-xl border border-rose-100/60 bg-gradient-to-br from-rose-50/30 to-emerald-50/30 p-2">
                      <img
                        src={WHY_AASHA_IMAGES[activeWhyImage].src}
                        alt={WHY_AASHA_IMAGES[activeWhyImage].alt}
                        className="w-full h-48 sm:h-56 object-contain"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setActiveWhyImage(
                            (idx) => (idx - 1 + WHY_AASHA_IMAGES.length) % WHY_AASHA_IMAGES.length
                          )
                        }
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border border-slate-200 bg-white/95 text-slate-700 hover:text-slate-900 hover:shadow-sm transition"
                        aria-label="Previous Why Aasha image"
                      >
                        {'<'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveWhyImage((idx) => (idx + 1) % WHY_AASHA_IMAGES.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border border-slate-200 bg-white/95 text-slate-700 hover:text-slate-900 hover:shadow-sm transition"
                        aria-label="Next Why Aasha image"
                      >
                        {'>'}
                      </button>
                    </div>

                    <p className="mt-3 text-center text-xs uppercase tracking-[0.12em] text-slate-500 font-medium">
                      {WHY_AASHA_IMAGES[activeWhyImage].label}
                    </p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      {WHY_AASHA_IMAGES.map((image, idx) => (
                        <button
                          key={image.label}
                          type="button"
                          onClick={() => setActiveWhyImage(idx)}
                          className={`h-2.5 rounded-full transition-all ${
                            idx === activeWhyImage ? 'w-7 bg-rose-400' : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                          }`}
                          aria-label={`Show ${image.label} image`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <article className="mt-5 sm:mt-6 w-full max-w-5xl mx-auto overflow-hidden rounded-3xl border border-rose-100/80 bg-white/85 backdrop-blur-sm shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="grid lg:grid-cols-[1.18fr_1fr] items-stretch">
              <div className="min-h-[24rem] bg-gradient-to-br from-rose-100/70 via-orange-50/70 to-amber-50/60 px-3 py-5 sm:px-4 sm:py-6 flex flex-col justify-center gap-4">
                <div className="w-full rounded-2xl border border-rose-200/60 bg-white/40 px-2 sm:px-3 py-2 overflow-hidden">
                  <img
                    src="/yemen.png"
                    alt="Maternal care context from Yemen"
                    className="w-full h-80 sm:h-96 lg:h-[30rem] object-contain scale-[1.16] origin-center"
                  />
                </div>
                <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-rose-700 font-semibold">
                    Case: Zainab (Yemen), 30 weeks
                  </p>
                  <p className="mt-1 text-[12px] sm:text-[13px] text-slate-700 leading-relaxed">
                    Zainab arrived fully dilated with premature twins after a long journey to reach care,
                    showing how quickly delayed prenatal access can become life-threatening.
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-7 lg:p-8 flex flex-col h-full">
                <div className="inline-flex items-center w-fit rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-rose-700 font-semibold">
                  Real Case from Yemen
                </div>
                <h4 className="mt-3 text-2xl sm:text-[1.72rem] font-semibold text-slate-900 leading-tight">
                  One delayed signal can become an emergency.
                </h4>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
                      The problem
                    </p>
                    <p className="mt-1.5 text-sm sm:text-base text-slate-700 leading-relaxed">
                      In low-resource and conflict-affected settings, many women miss prenatal care because
                      distance and cost are major barriers. Conditions like pre-eclampsia are often detected
                      late, when intervention is far more urgent.
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
                      The emotional reality
                    </p>
                    <p className="mt-1.5 text-sm sm:text-base text-slate-700 leading-relaxed">
                      Midwives like Rachel Coyle carry the weight of these delays, making high-stakes decisions
                      with limited visibility between visits while knowing every hour matters.
                    </p>
                  </div>
                </div>

                <div className="mt-auto pt-5">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3.5">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-700 font-semibold">
                      Why Aasha changes this
                    </p>
                    <p className="mt-1.5 text-sm sm:text-base text-emerald-900 leading-relaxed">
                      Aasha keeps care active between clinic visits by turning SMS check-ins and patient
                      symptom texts into early risk alerts. Teams can triage sooner, prioritize who needs
                      urgent attention first, and intervene before warning signs escalate.
                    </p>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                    Inspired by MSF reporting from Taiz Houban, Yemen (name changed in source for privacy).
                  </p>
                </div>
              </div>
            </div>
          </article>

          <div className="mt-6 sm:mt-8 mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={scrollToTop}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-white/70 transition-colors"
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              Back to top
            </button>
            <button
              type="button"
              onClick={() => setPublicRoute('/login')}
              className="px-4 py-2 rounded-lg border border-pregnancy bg-white text-pregnancy text-sm font-medium hover:bg-pregnancy/5 transition-colors"
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              Enter dashboard
            </button>
          </div>
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
