"use client";

/** Compact legend displayed alongside tool charts. */
export function LegendPills({
  items,
}: {
  items: Array<{ label: string; color: string; value?: string }>;
}) {
  return (
    <ul className="tool-legend" style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item, index) => (
        <li
          key={`${item.label}-${index}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "4px 10px", border: "1px solid var(--line, #ccc)" }}
        >
          <span
            aria-hidden="true"
            style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flex: "none" }}
          />
          <span>{item.label}</span>
          {item.value ? <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}
