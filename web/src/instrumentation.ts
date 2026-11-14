/** Runs once when the Next.js server starts: fail fast on bad configuration (task 0.5). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    env();
  }
}
