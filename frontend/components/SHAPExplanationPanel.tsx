"use client";

import React from "react";

type FeatureWeight = { name: string; impactHours: number };

type Props = {
  taskCode: string;
  forecastHours: number;
  baseHours: number;
  positiveImpacts: FeatureWeight[];
  negativeImpacts: FeatureWeight[];
  narrativeSummary: string;
};

export default function SHAPExplanationPanel({
  taskCode,
  forecastHours,
  baseHours,
  positiveImpacts,
  negativeImpacts,
  narrativeSummary,
}: Props) {
  const safeForecast = Math.max(forecastHours, 1);

  return (
    <aside className="flex w-full max-w-sm flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 text-zinc-100">
      <div className="mb-4">
        <span className="block text-[9px] font-mono font-bold uppercase tracking-[0.38em] text-[#ea580c]">Explainable AI Node</span>
        <h3 className="mt-0.5 text-sm font-bold tracking-tight text-zinc-100">Metrics: {taskCode}</h3>
      </div>

      <div className="mb-5 flex items-center justify-between rounded bg-[#27272a]/30 border border-zinc-800/80 p-4">
        <div>
          <span className="block text-[9px] font-mono uppercase tracking-[0.32em] text-zinc-500">AI Forecast</span>
          <span className="text-xl font-bold tracking-tight text-[#ea580c]">{forecastHours.toFixed(1)} hrs</span>
        </div>
        <div className="text-right">
          <span className="block text-[9px] font-mono uppercase tracking-[0.32em] text-zinc-500">Base Value</span>
          <span className="text-xs font-mono font-medium text-zinc-400">{baseHours.toFixed(1)} hrs</span>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        <h4 className="border-b border-zinc-900 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-zinc-400">
          Feature Weights Matrix
        </h4>

        {positiveImpacts.map((feature) => {
          const width = Math.min((feature.impactHours / safeForecast) * 100, 100);
          return (
            <div key={feature.name}>
              <div className="mb-1 flex justify-between text-[10px] font-mono text-zinc-400">
                <span>{feature.name}</span>
                <span className="font-bold text-blue-400">+{feature.impactHours.toFixed(1)}h</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-900">
                <div className="h-full rounded-r bg-blue-500" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}

        {negativeImpacts.map((feature) => {
          const width = Math.min((Math.abs(feature.impactHours) / safeForecast) * 100, 100);
          return (
            <div key={feature.name}>
              <div className="mb-1 flex justify-between text-[10px] font-mono text-zinc-400">
                <span>{feature.name}</span>
                <span className="font-bold text-orange-400">-{Math.abs(feature.impactHours).toFixed(1)}h</span>
              </div>
              <div className="flex h-1.5 w-full justify-end overflow-hidden rounded bg-zinc-900">
                <div className="h-full rounded-l bg-[#ea580c]" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded border border-zinc-800/60 bg-[#27272a]/20 p-4 text-left">
        <span className="mb-1.5 block text-[9px] font-mono font-bold uppercase tracking-[0.32em] text-zinc-400">
          Narrative Analysis
        </span>
        <p className="text-xs leading-relaxed text-zinc-400">{narrativeSummary}</p>
      </div>
    </aside>
  );
}
