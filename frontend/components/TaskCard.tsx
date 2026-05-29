"use client";

import React from "react";

type Props = {
  id: string;
  title: string;
  storyPoints: number;
  aiHours: number;
  riskLevel: "Low" | "Medium" | "High";
  assigneeInitials: string;
  onClick?: () => void;
};

const riskTone = {
  Low: "bg-emerald-500",
  Medium: "bg-amber-500",
  High: "bg-red-500",
};

export default function TaskCard({
  id,
  title,
  storyPoints,
  aiHours,
  riskLevel,
  assigneeInitials,
  onClick,
}: Props) {
  const riskColor = riskTone[riskLevel];

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer select-none rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 shadow-lg shadow-black/20 transition hover:border-[#ea580c]/60 hover:bg-zinc-900/70"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono font-bold tracking-[0.35em] text-[#ea580c]">{id}</span>
        <div className={`h-2.5 w-2.5 rounded-full ${riskColor}`} title={`Temporal Risk: ${riskLevel}`} />
      </div>

      <h4 className="text-xs font-medium leading-relaxed tracking-tight text-zinc-300 transition-colors group-hover:text-zinc-100">
        {title}
      </h4>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-900 pt-3 text-[10px] font-mono">
        <div className="flex gap-1.5">
          <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-zinc-400" title="Story Points">
            SP: {storyPoints}
          </span>
          <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-bold text-[#ea580c]" title="AI Estimated Effort">
            {aiHours.toFixed(1)}h
          </span>
        </div>

        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[9px] font-bold text-zinc-200" title="Assigned Engineer">
          {assigneeInitials}
        </div>
      </div>
    </div>
  );
}

