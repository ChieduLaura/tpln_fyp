import type { Server as SocketIOServer } from "socket.io";

type RiskAlertData = {
  project_id: string;
  risk_probability: number;
  will_slip?: boolean;
  forecasted_completion_date: string;
  confidence: "low" | "medium" | "high";
  top_risk_factors: string[];
};

class NotificationService {
  private io: SocketIOServer | null = null;

  setSocketServer(io: SocketIOServer): void {
    this.io = io;
  }

  broadcastRiskAlert(projectId: string, alertData: RiskAlertData): void {
    this.io?.to(projectId).emit("risk_alert", {
      projectId,
      ...alertData
    });
  }

  broadcastTaskUpdate(projectId: string, taskData: unknown): void {
    this.io?.to(projectId).emit("task_updated", {
      projectId,
      task: taskData
    });
  }
}

export const notificationService = new NotificationService();