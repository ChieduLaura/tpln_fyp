"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

type RiskAlert = {
  projectId: string;
  risk_probability: number;
  forecasted_completion_date: string;
  confidence: "low" | "medium" | "high";
  top_risk_factors: string[];
};

type Props = {
  projectId: string;
};

export default function RiskAlertBanner({ projectId }: Props) {
  const [alert, setAlert] = useState<RiskAlert | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const socket: Socket = io(socketUrl, {
      transports: ["websocket"],
      withCredentials: true
    });

    socket.on("connect", () => {
      socket.emit("join_project", { projectId });
    });

    socket.on("risk_alert", (payload: RiskAlert) => {
      if (payload?.projectId === projectId) {
        setAlert(payload);
      }
    });

    return () => {
      socket.emit("leave_project", { projectId });
      socket.disconnect();
    };
  }, [projectId]);

  if (!alert) {
    return null;
  }

  return (
    <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/80 px-4 py-3 text-red-50 shadow-lg shadow-red-950/30 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-300">Risk alert</p>
          <p className="mt-1 text-sm text-red-100">
            Forecasted slip risk is <span className="font-semibold">{Math.round(alert.risk_probability * 100)}%</span>.
          </p>
          <p className="mt-1 text-sm text-red-100">
            Forecasted completion date: <span className="font-medium">{alert.forecasted_completion_date}</span>
          </p>
          <div className="mt-2 text-sm text-red-100">
            <span className="font-medium">Top risk factors:</span>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {alert.top_risk_factors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAlert(null)}
          className="rounded-full border border-red-400/40 px-3 py-1 text-xs font-medium text-red-100 transition hover:bg-red-500/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}