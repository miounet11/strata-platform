/**
 * Naming rules for cards, kept free of the catalogue import so they can be tested directly.
 *
 * `lib/gpus` reads `gpus.json` through the bundler, which `node --test` cannot do; these two
 * rules decide what a page prints and how siblings are ordered, so they need to be callable
 * from a test rather than mirrored there.
 */

/**
 * The model number in a card name: "GeForce RTX 4090 Max-Q" → "4090", "RX 7900 XTX" → "7900".
 *
 * Only meaningful relative to another card of the same series; a name without a number simply
 * has no affinity rather than being an error.
 */
export function modelNumber(name: string): string {
  return /\b(\d{3,4})\b/.exec(name)?.[1] ?? "";
}

/**
 * The capacity to print beside a card name, or "" when the name already states it.
 *
 * 134 cards are named with their memory ("RTX 4060 Ti 16GB"), so appending " · 16 GB" produced
 * "RTX 4060 Ti 16GB · 16 GB" in every list, table and related-content row.
 */
export function vramLabel(gpu: { name: string; vramGb: number }, sharedLabel: string): string {
  if (!(gpu.vramGb > 0)) return sharedLabel;
  const stated = /(\d+)\s*GB\b/i.exec(gpu.name);
  return stated && Number(stated[1]) === gpu.vramGb ? "" : `${gpu.vramGb} GB`;
}
