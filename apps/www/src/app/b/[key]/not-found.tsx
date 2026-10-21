/**
 * A wrong path and a disabled board both land here, with the same body: nothing on this page
 * confirms that a board exists at some other address.
 */
export default function NotFound() {
  return (
    <main style={{ maxWidth: "26rem", margin: "20vh auto", fontSize: "0.9rem" }}>
      <h1>404</h1>
      <p className="muted">This page could not be found.</p>
    </main>
  );
}
