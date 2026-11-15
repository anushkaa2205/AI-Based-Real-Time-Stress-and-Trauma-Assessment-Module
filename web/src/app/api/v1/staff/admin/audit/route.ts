/**
 * GET /api/v1/staff/admin/audit (task 8.6, FR-AUD-03, §5.9): auditor only. Metadata holds ids,
 * versions and counts, never victim text (rule 9). Newest first, offset cursor.
 */
import { AuditQuery, decodeCursor, encodeCursor } from "@/contracts/staff";
import { route } from "@/lib/route";
import { AuditLog } from "@/models";

const DAY_MS = 86_400_000;

export const GET = route({ auth: "staff", action: "audit.read", query: AuditQuery }, async ({ query }) => {
  const filter: Record<string, unknown> = {};
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.actorId) filter.actorId = query.actorId;
  if (query.action) filter.action = query.action;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: new Date(`${query.from}T00:00:00Z`) } : {}),
      ...(query.to ? { $lt: new Date(new Date(`${query.to}T00:00:00Z`).getTime() + DAY_MS) } : {}),
    };
  }
  const offset = decodeCursor(query.cursor);
  const rows = await AuditLog.find(filter).sort({ _id: -1 }).skip(offset).limit(query.limit + 1).lean();
  return {
    items: rows.slice(0, query.limit).map((r) => ({
      id: String(r._id),
      at: new Date(r.createdAt as unknown as Date).toISOString(),
      actorType: r.actorType,
      actorId: r.actorId ?? null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      metadata: r.metadata ?? null,
      hash: r.hash,
    })),
    nextCursor: rows.length > query.limit ? encodeCursor(offset + query.limit) : null,
  };
});
