/** The integration view of an interaction's current assessment (task 8.4, API_CONTRACTS §6). */
import { Assessment } from "@/models";

export interface IntegrationAssessment {
  assessmentId: string;
  seq: number;
  svi: number;
  band: string;
  confidence: number;
  limitedConfidence: boolean;
  explanation: string;
  overridesFired: string[];
  topDimensions: { dimension: string; score: number }[];
  updatedAt: string;
}

export async function latestAssessment(interactionId: string): Promise<IntegrationAssessment | null> {
  const a = await Assessment.findOne({ interactionId }).sort({ seq: -1 }).lean();
  if (!a) return null;
  const dims = (a.dimensions instanceof Map ? Object.fromEntries(a.dimensions) : a.dimensions) as Record<string, { score?: number }> | undefined;
  const topDimensions = Object.entries(dims ?? {})
    .map(([dimension, v]) => ({ dimension, score: Math.round((v?.score ?? 0) * 100) / 100 }))
    .filter((d) => d.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
  return {
    assessmentId: String(a._id),
    seq: a.seq,
    svi: a.svi,
    band: a.band,
    confidence: a.confidence,
    limitedConfidence: a.limitedConfidence ?? false,
    explanation: a.explanation,
    overridesFired: a.overridesFired ?? [],
    topDimensions,
    updatedAt: new Date(a.createdAt as unknown as Date).toISOString(),
  };
}
