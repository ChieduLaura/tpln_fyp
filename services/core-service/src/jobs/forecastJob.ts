import axios from "axios";
import pool from "../db/pool";
import { notificationService } from "../services/notificationService";

type ProjectRow = {
  id: string;
  name: string;
};

type WeeklySnapshot = {
  week: number;
  completed_points: number;
  remaining_points: number;
  resource_burn_rate: number;
  active_risk_count: number;
  team_availability_ratio: number;
};

type ForecastResponse = {
  project_id: string;
  risk_probability: number;
  will_slip: boolean;
  forecasted_completion_date: string;
  confidence: "low" | "medium" | "high";
  top_risk_factors: string[];
};

const FORECASTING_URL = process.env.FORECASTING_SERVICE_URL || "http://localhost:8002";
const FORECAST_INTERVAL_MS = 15 * 60 * 1000;

let forecastTimer: NodeJS.Timeout | null = null;

async function ensureForecastTables(): Promise<void> {
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_lifecycle (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      old_status task_status,
      new_status task_status NOT NULL,
      changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      changed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_forecasts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      risk_probability numeric(5,4) NOT NULL,
      will_slip boolean NOT NULL,
      forecasted_completion_date date,
      confidence text NOT NULL,
      top_risk_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_project_forecasts_project_id ON project_forecasts (project_id)");
}

async function fetchActiveProjects(): Promise<ProjectRow[]> {
  const result = await pool.query<ProjectRow>(`
    SELECT id, name
    FROM projects
    WHERE status = 'active'
      AND deleted_at IS NULL
    ORDER BY created_at DESC
  `);

  return result.rows;
}

async function fetchWeeklySnapshots(projectId: string): Promise<WeeklySnapshot[]> {
  const result = await pool.query<WeeklySnapshot>(`
    WITH week_series AS (
      SELECT
        gs.week_index AS week,
        date_trunc('week', now()) - ((11 - gs.week_index) * interval '1 week') AS week_end
      FROM generate_series(0, 11) AS gs(week_index)
    ),
    task_scope AS (
      SELECT COALESCE(SUM(COALESCE(t.story_points, 1)), 0) AS total_points
      FROM tasks t
      WHERE t.project_id = $1
    ),
    historical_series AS (
      SELECT
        ws.week,
        ws.week_end,
        ts.total_points,
        COALESCE((
          SELECT SUM(COALESCE(t.story_points, 1))
          FROM tasks t
          WHERE t.project_id = $1
            AND (
              (t.status = 'done' AND t.updated_at <= ws.week_end)
              OR EXISTS (
                SELECT 1
                FROM task_lifecycle tl
                WHERE tl.task_id = t.id
                  AND tl.new_status = 'done'
                  AND tl.changed_at <= ws.week_end
              )
            )
        ), 0) AS completed_points,
        COALESCE((
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.project_id = $1
            AND (
              (t.status = 'blocked' AND t.updated_at <= ws.week_end)
              OR EXISTS (
                SELECT 1
                FROM task_lifecycle tl
                WHERE tl.task_id = t.id
                  AND tl.new_status = 'blocked'
                  AND tl.changed_at <= ws.week_end
              )
            )
        ), 0) AS active_risk_count
      FROM week_series ws
      CROSS JOIN task_scope ts
    )
    SELECT
      hs.week,
      hs.completed_points::int AS completed_points,
      GREATEST(hs.total_points - hs.completed_points, 0)::int AS remaining_points,
      ROUND((hs.completed_points - COALESCE(LAG(hs.completed_points) OVER (ORDER BY hs.week), 0))::numeric, 2) AS resource_burn_rate,
      hs.active_risk_count::int AS active_risk_count,
      CASE
        WHEN hs.total_points = 0 THEN 1
        ELSE GREATEST(
          0.45,
          LEAST(
            1,
            1 - (GREATEST(hs.total_points - hs.completed_points, 0)::numeric / hs.total_points) * 0.55 - (hs.active_risk_count::numeric / GREATEST(hs.total_points, 1)) * 0.1
          )
        )
      END AS team_availability_ratio
    FROM historical_series hs
    ORDER BY hs.week
  `, [projectId]);

  return result.rows.map((row) => ({
    week: Number(row.week),
    completed_points: Number(row.completed_points),
    remaining_points: Number(row.remaining_points),
    resource_burn_rate: Number(row.resource_burn_rate),
    active_risk_count: Number(row.active_risk_count),
    team_availability_ratio: Number(row.team_availability_ratio)
  }));
}

async function saveForecast(projectId: string, forecast: ForecastResponse): Promise<void> {
  await pool.query(
    `INSERT INTO project_forecasts (
      project_id, risk_probability, will_slip, forecasted_completion_date, confidence, top_risk_factors
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      projectId,
      forecast.risk_probability,
      forecast.will_slip,
      forecast.forecasted_completion_date,
      forecast.confidence,
      JSON.stringify(forecast.top_risk_factors)
    ]
  );
}

async function forecastProject(project: ProjectRow): Promise<void> {
  const weekly_snapshots = await fetchWeeklySnapshots(project.id);
  if (weekly_snapshots.length === 0) {
    return;
  }

  const response = await axios.post<ForecastResponse>(
    `${FORECASTING_URL}/forecast`,
    {
      project_id: project.id,
      weekly_snapshots
    },
    { timeout: 15000 }
  );

  const forecast = response.data;
  await saveForecast(project.id, forecast);

  if (forecast.risk_probability > 0.45) {
    notificationService.broadcastRiskAlert(project.id, forecast);
  }
}

async function runForecastCycle(): Promise<void> {
  await ensureForecastTables();
  const projects = await fetchActiveProjects();

  for (const project of projects) {
    try {
      await forecastProject(project);
    } catch (error) {
      console.error(`Forecast job failed for project ${project.id}:`, error);
    }
  }
}

export function startForecastJob(): void {
  if (forecastTimer) {
    return;
  }

  void runForecastCycle();
  forecastTimer = setInterval(() => {
    void runForecastCycle();
  }, FORECAST_INTERVAL_MS);
}