/** GET /api/demo/library (task N.4): the scenario library, without its expected labels (test metadata never reaches a visitor). */
import { loadLibrary } from "@/core/demo/library";
import { publicDemoRoute } from "@/core/demo/public";

export const GET = publicDemoRoute({ limit: "other" }, async () => ({
  items: loadLibrary().map((s) => ({ id: s.id, title: s.title, languageTag: s.languageTag, language: s.language, audioSource: s.audioSource, firstSpeaker: s.firstSpeaker, script: s.script, recordingAvailable: s.recordingAvailable })),
}));
