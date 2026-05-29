"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pg_1 = require("pg");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
router.use(auth_1.requireAuth);
const createProjectSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    status: zod_1.z.enum(["active", "on_hold", "completed"]).optional(),
    start_date: zod_1.z.string().date().optional(),
    end_date: zod_1.z.string().date().optional()
});
const updateProjectSchema = zod_1.z
    .object({
    name: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().nullable().optional(),
    status: zod_1.z.enum(["active", "on_hold", "completed"]).optional(),
    start_date: zod_1.z.string().date().nullable().optional(),
    end_date: zod_1.z.string().date().nullable().optional()
})
    .refine((data) => Object.keys(data).length > 0, "At least one field is required");
async function ensureSoftDeleteColumn() {
    await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz");
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
router.post("/projects", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const { org_id, name, description, status, start_date, end_date } = parsed.data;
    try {
        await ensureSoftDeleteColumn();
        const orgAccess = await pool.query("SELECT id FROM organizations WHERE id = $1 AND owner_id = $2", [org_id, req.user.id]);
        if ((orgAccess.rowCount ?? 0) === 0) {
            res.status(403).json({ message: "Not allowed to create projects in this organization" });
            return;
        }
        const result = await pool.query(`INSERT INTO projects (org_id, name, description, status, start_date, end_date, created_by)
       VALUES ($1, $2, $3, COALESCE($4, 'active'), $5, $6, $7)
       RETURNING id, org_id, name, description, status, start_date, end_date, created_by, created_at, updated_at`, [org_id, name, description ?? null, status ?? null, start_date ?? null, end_date ?? null, req.user.id]);
        res.status(201).json({ project: result.rows[0] });
    }
    catch (error) {
        console.error("Create project error:", error);
        res.status(500).json({ message: "Failed to create project" });
    }
});
router.get("/projects", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        await ensureSoftDeleteColumn();
        const result = await pool.query(`SELECT DISTINCT p.id, p.org_id, p.name, p.description, p.status, p.start_date, p.end_date, p.created_by, p.created_at, p.updated_at
       FROM projects p
       JOIN organizations o ON o.id = p.org_id
       WHERE p.deleted_at IS NULL
         AND (p.created_by = $1 OR o.owner_id = $1)
       ORDER BY p.created_at DESC`, [req.user.id]);
        res.status(200).json({ projects: result.rows });
    }
    catch (error) {
        console.error("List projects error:", error);
        res.status(500).json({ message: "Failed to list projects" });
    }
});
router.get("/projects/:id", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const projectIdParam = req.params.id;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    if (!zod_1.z.string().uuid().safeParse(projectId).success) {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }
    try {
        await ensureSoftDeleteColumn();
        const allowed = await canAccessProject(projectId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Project not found" });
            return;
        }
        const projectResult = await pool.query(`SELECT id, org_id, name, description, status, start_date, end_date, created_by, created_at, updated_at
       FROM projects
       WHERE id = $1 AND deleted_at IS NULL`, [projectId]);
        const statsResult = await pool.query(`SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
         COUNT(*) FILTER (WHERE status = 'done')::int AS done,
         COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked
       FROM tasks
       WHERE project_id = $1`, [projectId]);
        res.status(200).json({
            project: projectResult.rows[0],
            task_stats: statsResult.rows[0]
        });
    }
    catch (error) {
        console.error("Get project error:", error);
        res.status(500).json({ message: "Failed to fetch project" });
    }
});
router.put("/projects/:id", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const projectIdParam = req.params.id;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    if (!zod_1.z.string().uuid().safeParse(projectId).success) {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    try {
        await ensureSoftDeleteColumn();
        const allowed = await canAccessProject(projectId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Project not found" });
            return;
        }
        const { name, description, status, start_date, end_date } = parsed.data;
        const result = await pool.query(`UPDATE projects
       SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         status = COALESCE($4, status),
         start_date = COALESCE($5, start_date),
         end_date = COALESCE($6, end_date)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, org_id, name, description, status, start_date, end_date, created_by, created_at, updated_at`, [projectId, name ?? null, description ?? null, status ?? null, start_date ?? null, end_date ?? null]);
        res.status(200).json({ project: result.rows[0] });
    }
    catch (error) {
        console.error("Update project error:", error);
        res.status(500).json({ message: "Failed to update project" });
    }
});
router.delete("/projects/:id", async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const projectIdParam = req.params.id;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    if (!zod_1.z.string().uuid().safeParse(projectId).success) {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }
    try {
        await ensureSoftDeleteColumn();
        const allowed = await canAccessProject(projectId, req.user.id);
        if (!allowed) {
            res.status(404).json({ message: "Project not found" });
            return;
        }
        await pool.query("UPDATE projects SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [projectId]);
        res.status(204).send();
    }
    catch (error) {
        console.error("Delete project error:", error);
        res.status(500).json({ message: "Failed to delete project" });
    }
});
exports.default = router;
