/** Animated SVG checkmark for action confirmations */
export function SuccessCheckmark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-checkmark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
