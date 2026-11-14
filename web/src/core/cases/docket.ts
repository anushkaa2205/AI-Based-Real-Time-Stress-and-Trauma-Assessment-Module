/**
 * Docket numbers (FR-CH-07): NHAA-<year>-<state code>-<6 digits>, e.g.
 * NHAA-2026-MH-004512. In a real deployment NHAA supplies the docket; here one
 * is generated when none is given. Pure: year and randomness are passed in.
 */
export const DOCKET_PATTERN = /^NHAA-\d{4}-[A-Z]{2}-\d{6}$/;

export function formatDocket(year: number, stateCode: string, n: number): string {
  const code = /^[A-Z]{2}$/.test(stateCode) ? stateCode : "XX";
  return `NHAA-${year}-${code}-${String(Math.abs(Math.trunc(n)) % 1_000_000).padStart(6, "0")}`;
}
