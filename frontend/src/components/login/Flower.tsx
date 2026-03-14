interface FlowerProps {
  left: number;
  top: number;
  size?: number;
  animated?: boolean;
  opacity?: number;
}

export function Flower({
  left,
  top,
  size = 28,
  animated = true,
  opacity = 1,
}: FlowerProps) {
  return (
    <div
      className={`${animated ? 'flower-bloom' : 'flower-static'} absolute pointer-events-none`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        opacity,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="w-full h-full">
        {/* Simple line-art flower, sketched petals */}
        <g
          className="flower-line-group"
          stroke="#f97373"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Petals */}
          <path
            d="M20 8 C22 6 24 6 26 8 C28 10 28 13 26 15 C24 17 22 17 20 15 C18 13 18 10 20 8 Z"
            className={animated ? 'flower-line' : 'flower-line-static'}
          />
          <path
            d="M28 14 C30 12 32 12 34 14 C36 16 36 19 34 21 C32 23 30 23 28 21 C26 19 26 16 28 14 Z"
            className={animated ? 'flower-line' : 'flower-line-static'}
          />
          <path
            d="M25 24 C27 22 29 22 31 24 C33 26 33 29 31 31 C29 33 27 33 25 31 C23 29 23 26 25 24 Z"
            className={animated ? 'flower-line' : 'flower-line-static'}
          />
          <path
            d="M15 24 C17 22 19 22 21 24 C23 26 23 29 21 31 C19 33 17 33 15 31 C13 29 13 26 15 24 Z"
            className={animated ? 'flower-line' : 'flower-line-static'}
          />
          <path
            d="M12 14 C14 12 16 12 18 14 C20 16 20 19 18 21 C16 23 14 23 12 21 C10 19 10 16 12 14 Z"
            className={animated ? 'flower-line' : 'flower-line-static'}
          />

          {/* Center */}
          <circle cx="20" cy="20" r="3.2" className={animated ? 'flower-line' : 'flower-line-static'} />
        </g>
      </svg>
    </div>
  );
}
