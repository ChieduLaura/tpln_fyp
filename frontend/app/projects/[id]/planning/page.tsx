"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import api from "../../../../lib/api";

type WbsTask = {
  title: string;
  description: string;
  estimated_story_points: number;
  complexity_score: number;
  dependencies: string[];
};

type WbsEpic = {
  name: string;
  description: string;
  tasks: WbsTask[];
};

type WbsResponse = {
  epics: WbsEpic[];
};

type GeneratedTask = {
  title: string;
  description: string;
  estimated_story_points: number;
  complexity_score: number;
};

export default function PlanningPage() {
  const params = useParams<{ id: string }>();
  const projectId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [projectGoal, setProjectGoal] = useState("");
  const [teamSize, setTeamSize] = useState(5);
  const [sprintLengthWeeks, setSprintLengthWeeks] = useState(2);
  const [techStackText, setTechStackText] = useState("Next.js, FastAPI, PostgreSQL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WbsResponse | null>(null);
  const [openEpics, setOpenEpics] = useState<Record<string, boolean>>({});
  const [addingTask, setAddingTask] = useState<string | null>(null);

  const techStack = useMemo(
    () => techStackText.split(",").map((item) => item.trim()).filter(Boolean),
    [techStackText]
  );

  const generatePlan = async () => {
    if (!projectGoal.trim()) {
      setError("Enter a project goal first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const planningBaseUrl = process.env.NEXT_PUBLIC_PLANNING_URL || "http://localhost:8004";
      const response = await fetch(`${planningBaseUrl}/generate-wbs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_goal: projectGoal,
          team_size: teamSize,
          sprint_length_weeks: sprintLengthWeeks,
          tech_stack: techStack,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to generate plan");
      }

      const data = (await response.json()) as WbsResponse;
      setPlan(data);
      setOpenEpics({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const addTaskToBacklog = async (task: GeneratedTask) => {
    if (!projectId) {
      return;
    }

    setAddingTask(task.title);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/tasks`, {
        title: task.title,
        description: task.description,
        story_points: task.estimated_story_points,
        complexity_score: task.complexity_score,
        status: "todo",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task to backlog");
    } finally {
      setAddingTask(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-orange-400">AI Planning</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-zinc-50 md:text-5xl">Generate a structured delivery plan</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
              Describe the outcome, team size, sprint length, and stack. The AI will break the work into epics and backlog-ready tasks.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-300">
            Project ID: <span className="font-mono text-zinc-100">{projectId}</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-5 shadow-2xl shadow-black/30 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-zinc-50">Plan Inputs</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Project goal</label>
                <textarea
                  value={projectGoal}
                  onChange={(e) => setProjectGoal(e.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-500/60"
                  placeholder="Build a customer onboarding portal with analytics and alerts"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Team size</label>
                  <input
                    type="number"
                    min={1}
                    value={teamSize}
                    onChange={(e) => setTeamSize(Number(e.target.value) || 1)}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-orange-500/60"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Sprint length (weeks)</label>
                  <input
                    type="number"
                    min={1}
                    value={sprintLengthWeeks}
                    onChange={(e) => setSprintLengthWeeks(Number(e.target.value) || 1)}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-orange-500/60"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Tech stack</label>
                <input
                  value={techStackText}
                  onChange={(e) => setTechStackText(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-500/60"
                  placeholder="React, Node.js, PostgreSQL"
                />
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/40 bg-red-950/70 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={generatePlan}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Generating..." : "Generate Plan with AI"}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-5 shadow-2xl shadow-black/30 backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-50">Generated WBS</h2>
              <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">Expandable tree</span>
            </div>

            {!plan ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center text-sm text-zinc-500">
                Generate a plan to see epics and tasks here.
              </div>
            ) : (
              <div className="space-y-4">
                {plan.epics.map((epic) => {
                  const epicOpen = openEpics[epic.name] ?? true;
                  return (
                    <div key={epic.name} className="rounded-2xl border border-zinc-800/70 bg-zinc-950/60">
                      <button
                        type="button"
                        onClick={() => setOpenEpics((current) => ({ ...current, [epic.name]: !epicOpen }))}
                        className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
                      >
                        <div>
                          <div className="text-xs font-mono uppercase tracking-[0.35em] text-orange-400">Epic</div>
                          <h3 className="mt-1 text-base font-semibold text-zinc-50">{epic.name}</h3>
                          <p className="mt-2 text-sm leading-6 text-zinc-400">{epic.description}</p>
                        </div>
                        <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">
                          {epicOpen ? "Collapse" : "Expand"}
                        </span>
                      </button>

                      {epicOpen && (
                        <div className="border-t border-zinc-800 px-4 py-4">
                          <div className="space-y-3">
                            {epic.tasks.map((task) => (
                              <div key={task.title} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div>
                                    <h4 className="text-sm font-semibold text-zinc-50">{task.title}</h4>
                                    <p className="mt-1 text-sm leading-6 text-zinc-400">{task.description}</p>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                                      <span className="rounded-full bg-zinc-900 px-3 py-1">{task.estimated_story_points} points</span>
                                      <span className="rounded-full bg-zinc-900 px-3 py-1">Complexity {task.complexity_score}/5</span>
                                      {task.dependencies.length > 0 && (
                                        <span className="rounded-full bg-zinc-900 px-3 py-1">
                                          Depends on: {task.dependencies.join(", ")}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => addTaskToBacklog(task)}
                                    disabled={addingTask === task.title}
                                    className="shrink-0 rounded-xl border border-orange-500/40 px-4 py-2 text-sm font-medium text-orange-300 transition hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {addingTask === task.title ? "Adding..." : "Add to Backlog"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}