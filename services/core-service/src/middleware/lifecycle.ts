import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";

type EntityType = "TASK" | "PROJECT" | "USER" | "ORGANIZATION" | "RISK" | "UNKNOWN";

interface LifecycleEntity {
  id?: string;
  project_id?: string;
  [key: string]: unknown;
}

interface LifecycleEventDocument {
  event_type: string;
  entity_type: EntityType;
  entity_id: string | null;
  actor_id: string | null;
  project_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  rationale?: string;
  ai_explanation?: unknown;
  timestamp: number;
}

declare global {
  namespace Express {
    interface Request {
      lifecycleRationale?: string;
      lifecycleAIExplanation?: unknown;
      lifecycleBeforeState?: Record<string, unknown>;
      lifecycleAfterState?: Record<string, unknown>;
    }
  }
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickEntityType(pathName: string): EntityType {
  const lower = pathName.toLowerCase();
  if (lower.includes("task")) return "TASK";
  if (lower.includes("project")) return "PROJECT";
  if (lower.includes("user") || lower.includes("auth")) return "USER";
  if (lower.includes("organization") || lower.includes("org")) return "ORGANIZATION";
  if (lower.includes("risk")) return "RISK";
  return "UNKNOWN";
}

function pickEntityFromBody(body: Record<string, unknown> | null): LifecycleEntity | null {
  if (!body) {
    return null;
  }

  const keys = ["task", "project", "user", "organization", "risk"];
  for (const key of keys) {
    const entity = asRecord(body[key]);
    if (entity) {
      return entity;
    }
  }

  if (typeof body.id === "string") {
    return body as LifecycleEntity;
  }

  return null;
}

function deriveEventType(method: string, originalUrl: string, body: Record<string, unknown> | null): string {
  const pathName = originalUrl.split("?")[0].toLowerCase();
  const entityType = pickEntityType(pathName);

  let action = "UPDATED";
  if (method === "POST") action = "CREATED";
  if (method === "DELETE") action = "DELETED";
  if (method === "PATCH" && pathName.includes("status")) action = "STATUS_UPDATED";

  if (method === "POST" && body && Object.prototype.hasOwnProperty.call(body, "token")) {
    action = "AUTHENTICATED";
  }

  return `${entityType}_${action}`;
}

export function lifecycleMiddleware(req: Request, res: Response, next: NextFunction): void {
  let responseBody: unknown;

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as Response["json"];

  const originalSend = res.send.bind(res);
  res.send = ((body: unknown) => {
    if (responseBody === undefined) {
      responseBody = body;
    }
    return originalSend(body);
  }) as Response["send"];

  res.on("finish", () => {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
      return;
    }

    if (res.statusCode < 200 || res.statusCode >= 400) {
      return;
    }

    if (mongoose.connection.readyState !== 1) {
      return;
    }

    const responseRecord = asRecord(responseBody);
    const entity = pickEntityFromBody(responseRecord);
    const pathName = req.originalUrl.split("?")[0];
    const entityType = pickEntityType(pathName);

    const paramsProjectId = req.params.projectId;
    const resolvedProjectId = Array.isArray(paramsProjectId)
      ? paramsProjectId[0]
      : paramsProjectId;

    const fallbackEntityIdParam = req.params.id;
    const resolvedEntityParamId = Array.isArray(fallbackEntityIdParam)
      ? fallbackEntityIdParam[0]
      : fallbackEntityIdParam;

    const afterState = req.lifecycleAfterState ?? entity ?? responseRecord ?? null;
    const event: LifecycleEventDocument = {
      event_type: deriveEventType(req.method, req.originalUrl, responseRecord),
      entity_type: entityType,
      entity_id: typeof entity?.id === "string" ? entity.id : resolvedEntityParamId ?? null,
      actor_id: req.user?.id ?? null,
      project_id:
        resolvedProjectId ??
        (typeof entity?.project_id === "string" ? entity.project_id : null) ??
        (typeof responseRecord?.project_id === "string" ? responseRecord.project_id : null),
      before_state: req.lifecycleBeforeState ?? null,
      after_state: asRecord(afterState),
      rationale: req.lifecycleRationale,
      ai_explanation: req.lifecycleAIExplanation,
      timestamp: Date.now()
    };

    void mongoose
      .connection
      .collection("lifecycle_events")
      .insertOne(event)
      .catch((error: unknown) => {
        console.error("Failed to write lifecycle event:", error);
      });
  });

  next();
}
