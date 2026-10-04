import { analyzeFootnotes } from "../src/kalci";


type EngineTemplate = {
  sourceType: string;
  citationStage: "first" | "subsequent";
  templateText: string;
};

async function loadEngineTemplates(): Promise<EngineTemplate[]> {
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const headers = { apikey: supabaseKey, Accept: "application/json" };
    const [typesResponse, templatesResponse] = await Promise.all([
      fetch(supabaseUrl + "/rest/v1/source_types?select=id,code&active=eq.true", { headers }),
      fetch(supabaseUrl + "/rest/v1/citation_templates?select=source_type_id,citation_stage,template_text", { headers })
    ]);
    if (!typesResponse.ok || !templatesResponse.ok) return [];
    const types = await typesResponse.json() as Array<{ id: string; code: string }>;
    const templates = await templatesResponse.json() as Array<{ source_type_id: string; citation_stage: "first"|"subsequent"; template_text: string }>;
    const codes = new Map(types.map((type) => [type.id, type.code]));
    return templates
      .map((template) => ({
        sourceType: codes.get(template.source_type_id) ?? "",
        citationStage: template.citation_stage,
        templateText: template.template_text
      }))
      .filter((template) => Boolean(template.sourceType));
  } catch {
    return [];
  }
}

type Input = {
  footnotes?: Array<{ footnoteNumber?: number; raw: string }>;
  text?: string;
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }});
  }
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const input = await request.json() as Input;
    const raw = Array.isArray(input.footnotes)
      ? input.footnotes.slice().sort((a,b) => (a.footnoteNumber ?? 0) - (b.footnoteNumber ?? 0)).map((item) => item.raw)
      : String(input.text ?? "").split(/\r?\n/);

    const footnotes = raw.filter((value) => value.trim().length > 0);
    if (!footnotes.length) return Response.json({ error: "Provide footnotes or text." }, { status: 400 });

    const engineTemplates = await loadEngineTemplates();
    const results = analyzeFootnotes(footnotes, engineTemplates);
    const total = results.length;
    const issueNumbers = new Set(results.filter((r) => r.findings.length).map((r) => r.number));
    const errors = results.filter((r) => r.findings.some((f) => f.severity === "error")).length;
    const warnings = results.filter((r) => r.findings.some((f) => f.severity === "warning")).length;
    const review = results.filter((r) => r.findings.some((f) => f.severity === "review")).length;
    const correct = Math.max(0, total - issueNumbers.size);
    const score = total ? Math.round((correct / total) * 100) : 0;
    const safeCorrections = results.reduce((count, result) =>
      count + result.segments.filter((segment) => segment.edits.length > 0 && segment.edits.every((edit) => edit.safe)).length, 0
    );

    return Response.json({
      style: { name: "KALCI", version: "February 2026" },
      statistics: { total, correct, errors, warnings, requiresReview: review, safeCorrections, score },
      sources: Array.from(
        results.flatMap((r) => r.segments)
          .filter((s) => s.sourceKey)
          .reduce((map, segment) => {
            const key = segment.sourceKey as string;
            const existing = map.get(key) ?? {
              key,
              name: segment.components.title ?? segment.raw,
              type: segment.sourceType,
              firstCitation: undefined as string | undefined,
              occurrences: [] as Array<{ footnote: number; occurrence: string; stage: string; id: string; raw: string }>,
              confidence: segment.sourceConfidence
            };
            existing.occurrences.push({
              footnote: Number(segment.id.split("-")[0]),
              occurrence: segment.occurrence,
              stage: segment.sourceOccurrence === 1 ? "first" : "subsequent",
              id: segment.id,
              raw: segment.raw
            });
            if (segment.occurrence === "first" && !existing.firstCitation) existing.firstCitation = segment.id;
            existing.confidence = Math.max(existing.confidence, segment.sourceConfidence);
            map.set(key, existing);
            return map;
          }, new Map<string, {
            key: string;
            name: string;
            type: string;
            firstCitation?: string;
            occurrences: Array<{ footnote: number; occurrence: string; stage: string; id: string; raw: string }>;
            confidence: number;
          }>())
          .values()
      ).map((source) => ({
        ...source,
        occurrenceCount: source.occurrences.length,
        firstFootnote: source.occurrences.find((item) => item.stage === "first")?.footnote ?? null,
        forms: Array.from(new Set(source.occurrences.map((item) => item.raw)))
      })),
      results
    }, { headers: { "access-control-allow-origin": "*" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }
}
