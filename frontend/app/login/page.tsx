"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "../../lib/api";
import axios from "axios";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "login" ? "login" : "signup";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = mode === "signup" ? { full_name: fullName, email, password } : { email, password };
      const res = await api.post(mode === "signup" ? "/auth/register" : "/auth/login", payload);
      const token = res.data?.token;
      if (token) {
        localStorage.setItem("token", token);
        window.location.assign("/dashboard");
      } else {
        setError("Invalid response from server");
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        if (typeof data === "string") {
          setError(data);
        } else if (data) {
          try {
            setError(JSON.stringify(data));
          } catch {
            setError(err.message ?? "Login failed");
          }
        } else {
          setError(
            `Unable to reach the API at ${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}. Make sure the core service is running and CORS is enabled.`
          );
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-orange-600/30">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-8rem] top-16 h-80 w-80 rounded-full bg-orange-600/20 blur-3xl" />
        <div className="absolute right-[-6rem] top-[20rem] h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.06),_transparent_38%)]" />
      </div>

      <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_0.9fr] lg:px-8">
        <section className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-orange-400">Workspace access</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-zinc-50 md:text-6xl">
            One account opens the planning console, risk view, and explainability panel.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-400 md:text-base">
            Create a workspace or sign back in to continue tracking tasks, forecasted effort, and AI explanations in the same environment.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { title: "Fast sign-in", text: "Return to your project shell in a few seconds." },
              { title: "Fresh signup", text: "Create the first account when the workspace is new." },
              { title: "AI insights", text: "Use the same account across planning and explainability." },
            ].map((item) => (
              <article key={item.title} className="rounded-2xl border border-zinc-800/70 bg-zinc-950/60 p-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-zinc-500">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-5 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-6">
          <div className="flex rounded-2xl border border-zinc-800 bg-zinc-900/50 p-1">
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${mode === "signup" ? "bg-zinc-50 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${mode === "login" ? "bg-zinc-50 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              Login
            </button>
          </div>

          <div className="mt-6">
            <p className="text-[10px] font-mono uppercase tracking-[0.45em] text-orange-400">{mode === "signup" ? "Create account" : "Welcome back"}</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-50">{mode === "signup" ? "Deploy a new workspace identity" : "Sign in to continue"}</h2>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">Full name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#ea580c]/60"
                  type="text"
                  placeholder="Ada Lovelace"
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#ea580c]/60"
                type="email"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#ea580c]/60"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div className="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}

            <button
              className="w-full rounded-2xl bg-[#ea580c] px-4 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? (mode === "signup" ? "Creating account..." : "Signing in...") : mode === "signup" ? "Sign Up" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
