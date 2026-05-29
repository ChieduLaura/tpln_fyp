"use client";

import React, { useEffect, useState } from "react";
import api from "../lib/api";
import TaskCard from "./TaskCard";
import SHAPExplanationPanel from "./SHAPExplanationPanel";
import RiskAlertBanner from "./RiskAlertBanner";
import type { AxiosResponse } from "axios";

type Project = { id: string; name: string; status?: string; taskCount?: number };

type Assignee = { id: string; name: string; avatarUrl?: string } | null;
type Task = {
  id: string;
  title: string;
  status: string;
  assignee?: Assignee;
  storyPoints?: number;
  aiEstimate?: number;
  risk?: number;
  riskLevel?: "Low" | "Medium" | "High";
  shap?: {
    base_value: number;
    contributions: { feature: string; value: number }[];
    narrative_summary?: string;
  };
};

type Props = {
  projectId: string;
};

export default function ProjectWorkspace({ projectId }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [rightOpen, setRightOpen] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let mounted = true;

    const fetchWorkspace = async () => {
      try {
        const [pRes, tRes]: [AxiosResponse<Project>, AxiosResponse<Task[]>] =
          await Promise.all([
            api.get(`/projects/${projectId}`),
            api.get(`/projects/${projectId}/tasks`),
          ]);
        if (!mounted) return;
        setProject(pRes.data);
        setTasks(tRes.data || []);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchWorkspace();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  const columns = [
    { key: "todo", title: "To Do" },
    { key: "in_progress", title: "In Progress" },
    { key: "done", title: "Done" },
    { key: "blocked", title: "Blocked" },
  ];

  const getRiskLevel = (task: Task): "Low" | "Medium" | "High" => {
    if (task.riskLevel) return task.riskLevel;
    if (typeof task.risk !== "number") return "Low";
    if (task.risk > 0.6) return "High";
    if (task.risk > 0.3) return "Medium";
    return "Low";
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
  };

  const selectedTaskImpacts = selectedTask?.shap?.contributions ?? [];
  const positiveImpacts = selectedTaskImpacts
    .filter((feature) => feature.value >= 0)
    .map((feature) => ({ name: feature.feature, impactHours: feature.value }));
  const negativeImpacts = selectedTaskImpacts
    .filter((feature) => feature.value < 0)
    .map((feature) => ({ name: feature.feature, impactHours: feature.value }));

  return (
    <div className="flex min-h-full bg-[#09090b] text-zinc-100">
      <aside className="w-64 border-r border-zinc-900 bg-zinc-950/80 p-4 backdrop-blur-sm">
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-400">Project Node</p>
          <h3 className="mt-2 text-lg font-semibold text-zinc-100">{project?.name ?? "Project"}</h3>
        </div>
        <nav className="mt-6 space-y-2 text-sm">
          <a className="block rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-50">Tasks</a>
          <a className="block rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-50">Risks</a>
          <a className="block rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-50">Lifecycle</a>
          <a className="block rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-50">Settings</a>
        </nav>
      </aside>

      <main className="flex-1 overflow-auto px-6 py-6">
        <RiskAlertBanner projectId={projectId} />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-zinc-500">Workspace</p>
            <h2 className="text-2xl font-semibold text-zinc-50">{project?.name ?? "Project Workspace"}</h2>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500">Loading...</div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {columns.map((col) => (
              <div key={col.key} className="rounded-2xl border border-zinc-800/70 bg-zinc-950/60 p-3">
                <div className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-200">{col.title}</div>
                <div className="space-y-3">
                  {tasks.filter((t) => t.status === col.key).map((t) => (
                    <div key={t.id} onClick={() => setSelectedTask(t)}>
                      <TaskCard
                        id={t.id}
                        title={t.title}
                        storyPoints={t.storyPoints ?? 0}
                        aiHours={t.aiEstimate ?? 0}
                        riskLevel={getRiskLevel(t)}
                        assigneeInitials={getInitials(t.assignee?.name)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <aside className={`border-l border-zinc-900 bg-zinc-950 transition-all ${rightOpen ? "w-96" : "w-12"}`}>
        <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-4">
          <div className="text-sm font-medium text-zinc-200">AI Insights</div>
          <button onClick={() => setRightOpen((s) => !s)} className="text-sm text-zinc-500 transition hover:text-zinc-200">
            {rightOpen ? "Collapse" : "Open"}
          </button>
        </div>
        {rightOpen && (
          <div className="p-0">
            {selectedTask ? (
              <div className="space-y-3 p-4">
                <div className="text-sm text-zinc-500">Selected task</div>
                <div className="text-lg font-semibold text-zinc-50">{selectedTask.title}</div>
                <div className="mt-2">
                  <SHAPExplanationPanel
                    taskCode={selectedTask.id}
                    forecastHours={selectedTask.aiEstimate ?? 0}
                    baseHours={selectedTask.shap?.base_value ?? 0}
                    positiveImpacts={positiveImpacts}
                    negativeImpacts={negativeImpacts}
                    narrativeSummary={selectedTask.shap?.narrative_summary ?? "No narrative analysis is available for this task yet."}
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-zinc-500">Select a task to see AI insights</div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
