type GlyphProps = {
  draw?: boolean;
  className?: string;
};

const pathProps = {
  fill: "var(--paper)",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinejoin: "round" as const,
  strokeLinecap: "square" as const,
};

export function NibGlyph({ draw = false, className = "" }: GlyphProps) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <g className={draw ? "draw" : undefined}>
        <path
          {...pathProps}
          pathLength={100}
          d="M48 88 L31.5 61 Q27 50 30.5 37 L34 21.5 Q35.5 15 39 14 H57 Q60.5 15 62 21.5 L65.5 37 Q69 50 64.5 61 Z"
        />
        <path {...pathProps} pathLength={100} d="M48 88 L48 53" fill="none" />
        <circle {...pathProps} cx="48" cy="47" r="3.4" fill="var(--bg)" />
        <path {...pathProps} pathLength={100} d="M38 29 H58" fill="none" />
        <path {...pathProps} pathLength={100} d="M37 36 H59" fill="none" />
      </g>
    </svg>
  );
}

export function CaliperGlyph({ draw = false, className = "" }: GlyphProps) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <g className={draw ? "draw" : undefined}>
        <path {...pathProps} pathLength={100} d="M10 36 H84 L88 40 V44 H10 Z" />
        <path {...pathProps} pathLength={100} d="M14 36 V16 H30 V36 Z" />
        <path {...pathProps} pathLength={100} d="M14 36v2m8-2v2m8-2v2m8-2v2m8-2v2m8-2v2m8-2v2m8-2v2m8-2v2m8-2v2" fill="none" />
        <path {...pathProps} pathLength={100} d="M62 38 v4 M66 38 v4 M70 38 v4 M74 38 v4" fill="none" />
        <circle {...pathProps} cx="84" cy="40" r="7" fill="var(--bg)" />
        <path {...pathProps} pathLength={100} d="M84 35.5 V44.5 M79.5 40 H88.5" fill="none" />
      </g>
    </svg>
  );
}

export function JunctionGlyph({ draw = false, className = "" }: GlyphProps) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <g className={draw ? "draw" : undefined}>
        <path {...pathProps} pathLength={100} d="M8 40 H20 M8 56 H20 M76 40 H88 M76 56 H88" fill="none" />
        <path {...pathProps} pathLength={100} d="M20 32 H68 L74 38 V64 H20 Z" />
        <path {...pathProps} pathLength={100} d="M24 40 H66" fill="none" opacity="0.55" />
        <circle {...pathProps} cx="32" cy="48" r="4.6" fill="var(--bg)" />
        <circle {...pathProps} cx="48" cy="48" r="4.6" fill="var(--bg)" />
        <circle {...pathProps} cx="64" cy="48" r="4.6" fill="var(--bg)" />
        <path {...pathProps} pathLength={100} d="M28.9 43.1 L35.1 52.9 M44.9 43.1 L51.1 52.9 M60.9 43.1 L67.1 52.9" fill="none" />
      </g>
    </svg>
  );
}

export function LensGlyph({ draw = false, className = "" }: GlyphProps) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <g className={draw ? "draw" : undefined}>
        <circle {...pathProps} cx="46" cy="38" r="24" fill="var(--bg)" />
        <path {...pathProps} pathLength={100} d="M46 12 v4 M46 60 v4 M20 38 h4 M72 38 h4" fill="none" />
        <path {...pathProps} pathLength={100} d="M34.5 25.5 A 15.5 15.5 0 0 1 46.5 16" fill="none" />
        <path {...pathProps} pathLength={100} d="M63 53 L81 81" fill="none" strokeWidth={5.2} />
        <path {...pathProps} pathLength={100} d="M63 53 L81 81" fill="none" stroke="var(--paper)" strokeWidth={2.2} />
      </g>
    </svg>
  );
}
