/** Plain-text GitHub body for indexable content (no MD parser required). */
export function CommunityBody({ body }: { body: string }) {
  if (!body.trim()) {
    return <p style={{ color: "var(--muted)" }}>No description on GitHub.</p>;
  }
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        fontFamily: "var(--mono)",
        fontSize: "0.88rem",
        color: "#cbd5e1",
        background: "#020617",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1rem",
        maxHeight: "none",
      }}
    >
      {body}
    </pre>
  );
}
