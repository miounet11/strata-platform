export type PlanStep = { name: string; done: boolean };

function normalizeStep(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("step name must not be empty");
  return trimmed;
}

/**
 * Ordered step register. A plan is complete only when it has at least one step and every one of
 * them is done, so an empty plan can never be reported as finished.
 */
export class Plan {
  #steps = new Map<string, boolean>();

  addStep(name: string): void {
    const key = normalizeStep(name);
    if (this.#steps.has(key)) throw new Error(`step "${key}" is already registered`);
    this.#steps.set(key, false);
  }

  completeStep(name: string): void {
    const key = normalizeStep(name);
    if (!this.#steps.has(key)) throw new Error(`unknown step "${key}"`);
    this.#steps.set(key, true);
  }

  get steps(): PlanStep[] {
    return [...this.#steps].map(([name, done]) => ({ name, done }));
  }

  isComplete(): boolean {
    return this.#steps.size > 0 && [...this.#steps.values()].every(Boolean);
  }
}
