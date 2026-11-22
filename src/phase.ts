export type PhaseStatus = "pending" | "running" | "succeeded" | "failed";

/**
 * A single phase of the workflow. `advance()` walks pending -> running -> succeeded; `fail()`
 * stops it with a reason. Once a phase is terminal, neither method may move it again — that is the
 * failure guard: a failed phase cannot be silently advanced back into a successful one.
 */
export class Phase {
  readonly id: string;
  #status: PhaseStatus = "pending";
  #failure: string | null = null;

  constructor(id: string) {
    const trimmed = id.trim();
    if (!trimmed) throw new Error("phase id must not be empty");
    this.id = trimmed;
  }

  get status(): PhaseStatus {
    return this.#status;
  }

  get failure(): string | null {
    return this.#failure;
  }

  advance(): PhaseStatus {
    this.#assertActive();
    this.#status = this.#status === "pending" ? "running" : "succeeded";
    return this.#status;
  }

  fail(reason: string): void {
    this.#assertActive();
    const trimmed = reason.trim();
    if (!trimmed) throw new Error("a failed phase needs a non-empty reason");
    this.#status = "failed";
    this.#failure = trimmed;
  }

  #assertActive(): void {
    if (this.#status === "succeeded" || this.#status === "failed") {
      throw new Error(`Phase "${this.id}" is terminal (${this.#status})`);
    }
  }
}
