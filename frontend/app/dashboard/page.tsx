"use client";

import React, { useEffect, useState } from "react";
import api from "../../lib/api";

type Project = { id: string; name: string; status?: string; taskCount?: number };

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .get("/projects")
      .then((r) => {
        if (!mounted) return;
        setProjects(r.data || []);
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Your Projects</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="bg-white rounded shadow p-4 flex flex-col justify-between">
              <div>
                <div className="text-lg font-medium">{p.name}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${p.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{p.status ?? 'unknown'}</span>
                  <span className="text-xs text-gray-500">{p.taskCount ?? 0} tasks</span>
                </div>
              </div>
              <div className="mt-4">
                <a href={`/projects/${p.id}`} className="inline-block bg-indigo-600 text-white px-3 py-2 rounded hover:bg-indigo-700">View Project</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
