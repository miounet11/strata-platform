import type { ReactNode } from "react";
import "./board.css";

/**
 * The board lives outside `[locale]`, so it owns its own document. It deliberately renders no
 * site header or footer: the only link on the page is the one back to itself.
 */
export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
