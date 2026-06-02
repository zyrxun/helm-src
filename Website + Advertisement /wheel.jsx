/* Helm — wheel mark, inline SVG component
 * Renders the 8-spoke ship's wheel. Color and state set via props
 * so the same component covers idle (gold), running (green), and
 * any size. Match the brand-doc construction exactly.
 */

function HelmWheel({ size = 24, state = "idle", spin = "none", className = "", style = {} }) {
  // state: 'idle' (gold) | 'running' (green) | 'dark' (abyss)
  // spin:  'none' | 'slow' | 'fast'
  const palette = state === "running"
    ? { stroke: "var(--helm-green)", hubFill: "var(--helm-green-hub)" }
    : state === "dark"
      ? { stroke: "var(--helm-abyss)", hubFill: "var(--helm-chalk)" }
      : { stroke: "var(--helm-gold)", hubFill: "var(--helm-abyss)" };

  const spinClass =
    spin === "fast" ? "helm-spin-fast"
    : spin === "slow" ? "helm-spin-slow"
    : "";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`${spinClass} ${className}`.trim()}
      style={{ display: "block", ...style }}
      aria-hidden="true"
    >
      {/* Rim */}
      <circle cx="50" cy="50" r="38" fill="none" stroke={palette.stroke} strokeWidth="3.8" />
      {/* Handle knobs — 4 cardinal larger, 4 diagonal slightly smaller */}
      <circle cx="50" cy="8"  r="6.5" fill={palette.stroke} />
      <circle cx="50" cy="92" r="6.5" fill={palette.stroke} />
      <circle cx="8"  cy="50" r="6.5" fill={palette.stroke} />
      <circle cx="92" cy="50" r="6.5" fill={palette.stroke} />
      <circle cx="22.3" cy="22.3" r="5.5" fill={palette.stroke} />
      <circle cx="77.7" cy="22.3" r="5.5" fill={palette.stroke} />
      <circle cx="22.3" cy="77.7" r="5.5" fill={palette.stroke} />
      <circle cx="77.7" cy="77.7" r="5.5" fill={palette.stroke} />
      {/* Spokes */}
      <line x1="50" y1="8"  x2="50" y2="92" stroke={palette.stroke} strokeWidth="3.2" strokeLinecap="round" />
      <line x1="8"  y1="50" x2="92" y2="50" stroke={palette.stroke} strokeWidth="3.2" strokeLinecap="round" />
      <line x1="22.3" y1="22.3" x2="77.7" y2="77.7" stroke={palette.stroke} strokeWidth="3.2" strokeLinecap="round" />
      <line x1="77.7" y1="22.3" x2="22.3" y2="77.7" stroke={palette.stroke} strokeWidth="3.2" strokeLinecap="round" />
      {/* Hub ring + dot */}
      <circle cx="50" cy="50" r="9"   fill={palette.hubFill} stroke={palette.stroke} strokeWidth="3.2" />
      <circle cx="50" cy="50" r="3.5" fill={palette.stroke} />
    </svg>
  );
}

/* Custom UI glyphs — drawn to match the wheel's geometry
 *  - 1.5px stroke, round caps, no fills
 *  - currentColor so they take parent color
 */
function Glyph({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  switch (name) {
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v11" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      );
    case "menubar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M7 6h.01M11 6h.01" />
          <rect x="3" y="11" width="18" height="9" rx="2" />
        </svg>
      );
    case "stack":
      return (
        <svg {...common}>
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
          <path d="M3 18l9 5 9-5" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      );
    case "wheel":
      return (
        <svg {...common} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" />
          <circle cx="50" cy="50" r="9" />
          <line x1="50" y1="12" x2="50" y2="88" />
          <line x1="12" y1="50" x2="88" y2="50" />
          <line x1="23" y1="23" x2="77" y2="77" />
          <line x1="77" y1="23" x2="23" y2="77" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path d="M4 6h11" />
          <circle cx="18" cy="6" r="2" />
          <path d="M4 12h6" />
          <circle cx="13" cy="12" r="2" />
          <path d="M16 12h4" />
          <path d="M4 18h9" />
          <circle cx="16" cy="18" r="2" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9l3 3-3 3" />
          <path d="M13 15h4" />
        </svg>
      );
    case "cursor":
      return (
        <svg viewBox="0 0 14 16" width={size} height={size * (16/14)} aria-hidden="true">
          <path
            d="M1 1 L1 13 L4.5 10 L6.5 14.5 L8.5 13.5 L6.5 9 L11 9 Z"
            fill="var(--helm-chalk)"
            stroke="var(--helm-abyss)"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

Object.assign(window, { HelmWheel, Glyph });
