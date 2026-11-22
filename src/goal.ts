export type GoalStatus = "pending" | "accepted" | "rejected";

/**
 * Acceptance gate. A goal is accepted only when every declared criterion is present in the
 * evidence. A goal without criteria is deliberately rejected: an empty acceptance list must not
 * turn into a silently passing goal.
 */
export class Goal {
  #status: GoalStatus = "pending";
  #reason: string | null = null;
  #criteria: string[];

  readonly description: string;

  constructor(description: string, criteria: readonly string[] = []) {
    const trimmed = description.trim();
    if (!trimmed) throw new Error("goal description must not be empty");
    this.description = trimmed;
    this.#criteria = [...criteria];
  }

  get status(): GoalStatus {
    return this.#status;
  }

  get reason(): string | null {
    return this.#reason;
  }

  /** A copy, so a caller cannot push a criterion into the goal behind `accept()`'s back. */
  get criteria(): string[] {
    return [...this.#criteria];
  }

  accept(evidence: readonly string[] = []): boolean {
    if (this.#criteria.length === 0) {
      this.#status = "rejected";
      this.#reason = "no criteria defined";
      return false;
    }
    const missing = this.#criteria.filter((criterion) => !evidence.includes(criterion));
    if (missing.length > 0) {
      this.#status = "rejected";
      this.#reason = `missing evidence: ${missing.join(", ")}`;
      return false;
    }
    this.#status = "accepted";
    this.#reason = null;
    return true;
  }

  isAccepted(): boolean {
    return this.#status === "accepted";
  }
}
