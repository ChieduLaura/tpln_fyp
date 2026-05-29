import Link from "next/link";

export default function RootPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-orange-600/30">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-[-8rem] h-72 w-72 rounded-full bg-orange-600/20 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_42%)]" />
      </div>

      <header className="border-b border-zinc-900/80 bg-zinc-950/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-3.5 w-3.5 rotate-45 bg-[#ea580c] shadow-[0_0_24px_rgba(234,88,12,0.55)]" />
            <div>
              <div className="text-sm font-semibold tracking-[0.32em] text-zinc-100">TPLN.ai</div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Predictive lifecycle intelligence</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login?mode=login"
              className="rounded-full border border-zinc-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
            >
              Log In
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-full bg-[#ea580c] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl flex-col justify-center px-6 py-16 lg:px-8">
        <section className="grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-orange-400">
              Predictive Project Management
            </p>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-zinc-50 md:text-6xl">
              Forecast delivery risk before it becomes schedule debt.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 md:text-base">
              Generative planning, automated effort estimation, and explainable AI insights bring project execution into a single operational layer.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login?mode=signup"
                className="rounded-full bg-[#ea580c] px-6 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700"
              >
                Deploy Workspace Instance
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-zinc-800 bg-zinc-950/60 px-6 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900"
              >
                Open Dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-4 rounded-3xl border border-zinc-800/70 bg-zinc-950/60 p-4 shadow-2xl shadow-black/40 backdrop-blur-sm">
            {[
              {
                icon: "AI",
                title: "Effort Estimation",
                text: "Task durations are inferred from code complexity signals instead of manual story point guesses.",
              },
              {
                icon: "TR",
                title: "Temporal Risk Tracking",
                text: "Surface architectural bottlenecks and delivery drift before they slow release cadence.",
              },
              {
                icon: "SH",
                title: "SHAP Explainability",
                text: "See which features moved the forecast and how much each factor contributed to the final result.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 transition hover:border-zinc-700 hover:bg-zinc-900/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-400">{item.icon}</div>
                    <h2 className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-100">{item.title}</h2>
                  </div>
                  <div className="h-2.5 w-2.5 rounded-full bg-[#ea580c] shadow-[0_0_18px_rgba(234,88,12,0.6)]" />
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{item.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900/80 bg-zinc-950/70 px-6 py-4 text-[10px] font-mono uppercase tracking-[0.32em] text-zinc-500">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>Stable build // 0x_tpln_2026</span>
          <span>Final year project specification</span>
        </div>
      </footer>
    </div>
  );
}
