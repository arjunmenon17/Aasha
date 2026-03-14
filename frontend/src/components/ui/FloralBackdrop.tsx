import { Flower } from '@/components/login/Flower';

const BLOSSOMS = [
  { left: 6, top: 10, size: 22, opacity: 0.6 },
  { left: 14, top: 28, size: 18, opacity: 0.48 },
  { left: 92, top: 12, size: 24, opacity: 0.56 },
  { left: 84, top: 32, size: 20, opacity: 0.44 },
  { left: 8, top: 82, size: 20, opacity: 0.42 },
  { left: 92, top: 78, size: 24, opacity: 0.5 },
];

export function FloralBackdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="app-soft-orb app-soft-orb-a" />
      <div className="app-soft-orb app-soft-orb-b" />
      <div className="app-soft-orb app-soft-orb-c" />

      {BLOSSOMS.map((b, idx) => (
        <Flower
          key={idx}
          left={b.left}
          top={b.top}
          size={b.size}
          opacity={b.opacity}
          animated={false}
        />
      ))}
    </div>
  );
}

