/**
 * Circuit breaker for the analysis service (task 4.6). After 3 failures in a
 * row it stops calling for 30 s, so a down service costs no time per message;
 * then one trial call decides whether to close again. Clock passed in (pure).
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold = 3,
    private readonly coolDownMs = 30_000,
  ) {}

  canCall(nowMs: number): boolean {
    return nowMs >= this.openUntil;
  }

  success(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  failure(nowMs: number): void {
    this.failures++;
    if (this.failures >= this.threshold) this.openUntil = nowMs + this.coolDownMs;
  }

  get state(): "closed" | "open" {
    return this.openUntil > 0 && this.failures >= this.threshold ? "open" : "closed";
  }
}
