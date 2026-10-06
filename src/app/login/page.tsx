"use client";
import { useState } from "react";

export default function Login() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (res.ok) location.href = "/";
    else setError("That token didn't match APP_TOKEN.");
  }
  return (
    <main className="min-h-dvh grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-panel p-6 border border-line">
        <h1 className="text-xl font-semibold">Trip Recap</h1>
        <input
          type="password"
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="App token"
          className="input"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full">Unlock</button>
      </form>
    </main>
  );
}
