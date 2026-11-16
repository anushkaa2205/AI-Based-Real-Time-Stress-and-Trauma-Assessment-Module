/** The Nivara wordmark: a small petrol mark with the name set in the display face. */
export function Wordmark({ tone = "dark", size = "md" }: { tone?: "dark" | "light"; size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden className={`grid place-items-center rounded-lg ${big ? "size-10" : "size-8"} ${tone === "light" ? "bg-marigold" : "bg-brand"}`}>
        <svg viewBox="0 0 24 24" className={big ? "size-6" : "size-5"} fill="none" stroke={tone === "light" ? "#0c1a1f" : "#fff"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17c3-6 5-9 8-9s5 3 8 9" />
          <path d="M8 17c1.5-3 2.7-4.5 4-4.5s2.5 1.5 4 4.5" />
        </svg>
      </span>
      <span className={`display ${big ? "text-2xl" : "text-xl"} ${tone === "light" ? "text-white" : "text-ink"}`}>Nivara</span>
    </span>
  );
}
