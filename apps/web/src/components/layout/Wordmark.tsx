/**
 * A single geometric mark, not an illustration: an arc that reads as the "mada"
 * range/extent the name refers to. Uses currentColor so it works in both themes.
 */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="text-primary"
    >
      <rect width="32" height="32" rx="9" fill="currentColor" opacity="0.12" />
      <path
        d="M8 21.5c0-6.35 3.58-11 8-11s8 4.65 8 11"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="21.5" r="2.2" fill="currentColor" />
    </svg>
  );
}
