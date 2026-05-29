"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pg_1 = require("pg");
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
router.use(auth_1.requireAuth);
const createTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    status: zod_1.z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
    assigned_to: zod_1.z.string().uuid().optional(),
    story_points: zod_1.z.number().int().nullable().optional(),
    complexity_score: zod_1.z.number().int().min(1).max(5).nullable().optional(),
    sprint_number: zod_1.z.number().int().nullable().optional(),
    due_date: zod_1.z.string().date().nullable().optional()
});
const updateTaskSchema = zod_1.z
    .object({
    title: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().nullable().optional(),
    status: zod_1.z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
    assigned_to: zod_1.z.string().uuid().nullable().optional(),
    story_points: zod_1.z.number().int().nullable().optional(),
    complexity_score: zod_1.z.number().int().min(1).max(5).nullable().optional(),
    sprint_number: zod_1.z.number().int().nullable().optional(),
    due_date: zod_1.z.string().date().nullable().optional()
})
    .refine((data) => Object.keys(data).length > 0, "At least one field is required");
const updateTaskStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(["todo", "in_progress", "done", "blocked"])
});
const taskFilterSchema = zod_1.z.object({
    status: zod_1.z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
    assigned_to: zod_1.z.string().uuid().optional(),
    sprint: zod_1.z.coerce.number().int().optional()
});
const aiEstimateResponseSchema = zod_1.z.object({
    estimated_effort_hours: zod_1.z.number(),
    estimated_duration_days: zod_1.z.number(),
    complexity_score: zod_1.z.number().int().min(1).max(5).optional(),
    explanation: zod_1.z.unknown().optional(),
    xai_explanation: zod_1.z.unknown().optional(),
    confidence_score: zod_1.z.number().optional(),
    model_version: zod_1.z.string().optional(),
    shap_values: zod_1.z.unknown().optional()
});
async function ensureSupportTables() {
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
}
async function canAccessProject(projectId, userId) {
    const result = await pool.query(`SELECT p.id
     FROM projects p
     JOIN organizations o ON o.id = p.org_id
     WHERE p.id = $1
       AND p.deleted_at IS NULL
       AND (p.created_by = $2 OR o.owner_id = $2)
     LIMIT 1`, [projectId, userId]);
    return (result.rowCount ?? 0) > 0;
}
async function canAccessTask(taskId, userId) {
    const result = await pool.query(`SELECT t.id
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN organizations o ON o.id = p.org_id
     WHERE t.id = $1
       AND p.deleted_at IS NULL
       AND (p.created_by = $2 OR o.owner_id = $2 OR t.assigned_to = $2)
     LIMIT 1`, [taskId, userId]);
    return (result.rowCount ?? 0) > 0;
}
router.post("/projects/:projectId/tasks", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const projectIdParam = req.params.projectId;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    if (!zod_1.z.string().uuid().safeParse(projectId).success) {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const { title, description, status, assigned_to, story_points, complexity_score, sprint_number, due_date } = parsed.data;
    try {
        await ensureSupportTables();
        const allowed = await canAccessProject(projectId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Project not found" });
            return;
        }
        const insertResult = await pool.query(`INSERT INTO tasks (project_id, title, description, status, assigned_to, story_points, complexity_score, sprint_number, due_date)
       VALUES ($1, $2, $3, COALESCE($4, 'todo'), $5, $6, $7, $8, $9)
       RETURNING id, project_id, title, description, status, assigned_to, story_points, complexity_score, sprint_number, due_date, created_at, updated_at`, [projectId, title, description ?? null, status ?? null, assigned_to ?? null, story_points ?? null, complexity_score ?? null, sprint_number ?? null, due_date ?? null]);
        const task = insertResult.rows[0];
        const aiPayload = {
            task_id: task.id,
            project_id: task.project_id,
            title: task.title,
            description: task.description,
            story_points: task.story_points,
            complexity_score: task.complexity_score,
            sprint_number: task.sprint_number,
            due_date: task.due_date
        };
        const aiResponse = await axios_1.default.post("http://ai-estimation:8001/estimate", aiPayload, { timeout: 10000 });
        const parsedEstimate = aiEstimateResponseSchema.safeParse(aiResponse.data);
        if (!parsedEstimate.success) {
            res.status(502).json({ message: "Invalid response from AI estimation service" });
            return;
        }
        const estimate = parsedEstimate.data;
        const xaiExplanation = estimate.xai_explanation ?? estimate.explanation ?? null;
        await pool.query(`UPDATE tasks
       SET ai_estimated_effort_hours = $2,
           ai_estimated_duration_days = $3,
           complexity_score = COALESCE($4, complexity_score),
           xai_explanation_json = $5
       WHERE id = $1`, [task.id, estimate.estimated_effort_hours, estimate.estimated_duration_days, estimate.complexity_score ?? null, xaiExplanation]);
        await pool.query(`INSERT INTO ai_predictions (task_id, prediction_type, predicted_value, confidence_score, model_version, shap_values_json)
       VALUES ($1, 'task_effort_duration', $2::jsonb, $3, $4, $5::jsonb)`, [
            task.id,
            JSON.stringify({
                estimated_effort_hours: estimate.estimated_effort_hours,
                estimated_duration_days: estimate.estimated_duration_days
            }),
            estimate.confidence_score ?? null,
            estimate.model_version ?? null,
            JSON.stringify(estimate.shap_values ?? null)
        ]);
        const taskResult = await pool.query(`SELECT id, project_id, title, description, status, assigned_to, story_points,
              ai_estimated_effort_hours, ai_estimated_duration_days, xai_explanation_json,
              complexity_score, sprint_number, due_date, created_at, updated_at
       FROM tasks
       WHERE id = $1`, [task.id]);
        res.status(201).json({ task: taskResult.rows[0] });
    }
    catch (error) {
        console.error("Create task error:", error);
        res.status(500).json({ message: "Failed to create task" });
    }
});
router.get("/projects/:projectId/tasks", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const projectIdParam = req.params.projectId;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    if (!zod_1.z.string().uuid().safeParse(projectId).success) {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }
    const parsedFilter = taskFilterSchema.safeParse(req.query);
    if (!parsedFilter.success) {
        res.status(400).json({ message: "Invalid query filters", errors: parsedFilter.error.flatten() });
        return;
    }
    try {
        await ensureSupportTables();
        const allowed = await canAccessProject(projectId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Project not found" });
            return;
        }
        const { status, assigned_to, sprint } = parsedFilter.data;
        const values = [projectId];
        const whereParts = ["project_id = $1"];
        if (status) {
            values.push(status);
            whereParts.push(`status = $${values.length}`);
        }
        if (assigned_to) {
            values.push(assigned_to);
            whereParts.push(`assigned_to = $${values.length}`);
        }
        if (sprint !== undefined) {
            values.push(sprint);
            whereParts.push(`sprint_number = $${values.length}`);
        }
        const result = await pool.query(`SELECT id, project_id, title, description, status, assigned_to, story_points,
              ai_estimated_effort_hours, ai_estimated_duration_days, xai_explanation_json,
              complexity_score, sprint_number, due_date, created_at, updated_at
       FROM tasks
       WHERE ${whereParts.join(" AND ")}
       ORDER BY created_at DESC`, values);
        res.status(200).json({ tasks: result.rows });
    }
    catch (error) {
        console.error("List tasks error:", error);
        res.status(500).json({ message: "Failed to list tasks" });
    }
});
router.put("/tasks/:id", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const taskIdParam = req.params.id;
    const taskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;
    if (!zod_1.z.string().uuid().safeParse(taskId).success) {
        res.status(400).json({ message: "Invalid task id" });
        return;
    }
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    try {
        await ensureSupportTables();
        const allowed = await canAccessTask(taskId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Task not found" });
            return;
        }
        const { title, description, status, assigned_to, story_points, complexity_score, sprint_number, due_date } = parsed.data;
        const result = await pool.query(`UPDATE tasks
       SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         status = COALESCE($4, status),
         assigned_to = COALESCE($5, assigned_to),
         story_points = COALESCE($6, story_points),
         complexity_score = COALESCE($7, complexity_score),
         sprint_number = COALESCE($8, sprint_number),
         due_date = COALESCE($9, due_date)
       WHERE id = $1
       RETURNING id, project_id, title, description, status, assigned_to, story_points,
                 ai_estimated_effort_hours, ai_estimated_duration_days, xai_explanation_json,
                 complexity_score, sprint_number, due_date, created_at, updated_at`, [
            taskId,
            title ?? null,
            description ?? null,
            status ?? null,
            assigned_to ?? null,
            story_points ?? null,
            complexity_score ?? null,
            sprint_number ?? null,
            due_date ?? null
        ]);
        res.status(200).json({ task: result.rows[0] });
    }
    catch (error) {
        console.error("Update task error:", error);
        res.status(500).json({ message: "Failed to update task" });
    }
});
router.patch("/tasks/:id/status", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const taskIdParam = req.params.id;
    const taskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;
    if (!zod_1.z.string().uuid().safeParse(taskId).success) {
        res.status(400).json({ message: "Invalid task id" });
        return;
    }
    const parsed = updateTaskStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    try {
        await ensureSupportTables();
        const allowed = await canAccessTask(taskId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Task not found" });
            return;
        }
        const currentResult = await pool.query("SELECT status FROM tasks WHERE id = $1", [taskId]);
        if ((currentResult.rowCount ?? 0) === 0) {
            res.status(404).json({ message: "Task not found" });
            return;
        }
        const oldStatus = currentResult.rows[0].status;
        const newStatus = parsed.data.status;
        const updatedResult = await pool.query(`UPDATE tasks
       SET status = $2
       WHERE id = $1
       RETURNING id, project_id, title, description, status, assigned_to, story_points,
                 ai_estimated_effort_hours, ai_estimated_duration_days, xai_explanation_json,
                 complexity_score, sprint_number, due_date, created_at, updated_at`, [taskId, newStatus]);
        await pool.query(`INSERT INTO task_lifecycle (task_id, old_status, new_status, changed_by)
       VALUES ($1, $2, $3, $4)`, [taskId, oldStatus, newStatus, req.user.id]);
        res.status(200).json({ task: updatedResult.rows[0] });
    }
    catch (error) {
        console.error("Update task status error:", error);
        res.status(500).json({ message: "Failed to update task status" });
    }
});
router.get("/tasks/:id/explanation", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const taskIdParam = req.params.id;
    const taskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;
    if (!zod_1.z.string().uuid().safeParse(taskId).success) {
        res.status(400).json({ message: "Invalid task id" });
        return;
    }
    try {
        await ensureSupportTables();
        const allowed = await canAccessTask(taskId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Task not found" });
            return;
        }
        const result = await pool.query("SELECT id, xai_explanation_json FROM tasks WHERE id = $1", [taskId]);
        if ((result.rowCount ?? 0) === 0) {
            res.status(404).json({ message: "Task not found" });
            return;
        }
        res.status(200).json({
            task_id: result.rows[0].id,
            xai_explanation_json: result.rows[0].xai_explanation_json
        });
    }
    catch (error) {
        console.error("Get task explanation error:", error);
        res.status(500).json({ message: "Failed to fetch task explanation" });
    }
});
exports.default = router;
