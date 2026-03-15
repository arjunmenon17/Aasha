import { useEffect, useState } from 'react';

interface BrandedLoaderProps {
  message?: string;
  size?: 'md' | 'lg';
}

export function BrandedLoader({
  message = 'Loading Aasha…',
  size = 'lg',
}: BrandedLoaderProps) {
  const isLarge = size === 'lg';
  const logoSize = isLarge ? 'h-28' : 'h-20';
  const barWidth = isLarge ? 'w-96' : 'w-72';
  const verticalOffset = isLarge ? 'translate-y-12' : 'translate-y-6';
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const tick = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 96) return prev;
        const step = prev < 60 ? 6 : prev < 85 ? 3 : 1;
        return Math.min(prev + step, 96);
      });
    }, 220);

    return () => clearInterval(tick);
  }, []);

  return (
    <div
      className={`flex min-h-[60vh] w-full flex-col items-center justify-center text-center ${verticalOffset}`}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <img src="/aasha.png" alt="" className={`${logoSize} w-auto object-contain`} />
      <div
        className={`aasha-progress-track mt-6 ${barWidth}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Loading progress"
      >
        <div
          className="aasha-progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 text-xs font-semibold tracking-[0.12em] text-slate-500">
        {progress}%
      </div>
      <div className="mt-3 text-base font-medium tracking-wide text-slate-600">
        {message}
      </div>
    </div>
  );
}
