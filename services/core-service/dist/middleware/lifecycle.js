"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lifecycleMiddleware = lifecycleMiddleware;
const mongoose_1 = __importDefault(require("mongoose"));
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function pickEntityType(pathName) {
    const lower = pathName.toLowerCase();
    if (lower.includes("task"))
        return "TASK";
    if (lower.includes("project"))
        return "PROJECT";
    if (lower.includes("user") || lower.includes("auth"))
        return "USER";
    if (lower.includes("organization") || lower.includes("org"))
        return "ORGANIZATION";
    if (lower.includes("risk"))
        return "RISK";
    return "UNKNOWN";
}
function pickEntityFromBody(body) {
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
        return body;
    }
    return null;
}
function deriveEventType(method, originalUrl, body) {
    const pathName = originalUrl.split("?")[0].toLowerCase();
    const entityType = pickEntityType(pathName);
    let action = "UPDATED";
    if (method === "POST")
        action = "CREATED";
    if (method === "DELETE")
        action = "DELETED";
    if (method === "PATCH" && pathName.includes("status"))
        action = "STATUS_UPDATED";
    if (method === "POST" && body && Object.prototype.hasOwnProperty.call(body, "token")) {
        action = "AUTHENTICATED";
    }
    return `${entityType}_${action}`;
}
function lifecycleMiddleware(req, res, next) {
    let responseBody;
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
        responseBody = body;
        return originalJson(body);
    });
    const originalSend = res.send.bind(res);
    res.send = ((body) => {
        if (responseBody === undefined) {
            responseBody = body;
        }
        return originalSend(body);
    });
    res.on("finish", () => {
        if (!STATE_CHANGING_METHODS.has(req.method)) {
            return;
        }
        if (res.statusCode < 200 || res.statusCode >= 400) {
            return;
        }
        if (mongoose_1.default.connection.readyState !== 1) {
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
        const event = {
            event_type: deriveEventType(req.method, req.originalUrl, responseRecord),
            entity_type: entityType,
            entity_id: typeof entity?.id === "string" ? entity.id : resolvedEntityParamId ?? null,
            actor_id: req.user?.id ?? null,
            project_id: resolvedProjectId ??
                (typeof entity?.project_id === "string" ? entity.project_id : null) ??
                (typeof responseRecord?.project_id === "string" ? responseRecord.project_id : null),
            before_state: req.lifecycleBeforeState ?? null,
            after_state: asRecord(afterState),
            rationale: req.lifecycleRationale,
            ai_explanation: req.lifecycleAIExplanation,
            timestamp: Date.now()
        };
        void mongoose_1.default
            .connection
            .collection("lifecycle_events")
            .insertOne(event)
            .catch((error) => {
            console.error("Failed to write lifecycle event:", error);
        });
    });
    next();
}
