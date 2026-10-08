"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useTranslations("auth");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    const path = mode === "login" ? "/v1/auth/login" : "/v1/auth/register";
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (data.token) {
        localStorage.setItem("strata_token", data.token);
        setMessage("OK — token saved locally.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t("apiHint")}</p>
      <label>
        {t("email")}
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        {t("password")}
        <input name="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </label>
      <button type="submit" className="btn btn-primary">
        {mode === "login" ? t("submitLogin") : t("submitRegister")}
      </button>
      {message ? <p style={{ color: "var(--accent)" }}>{message}</p> : null}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
    </form>
  );
}
