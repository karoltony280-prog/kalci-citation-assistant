import { analyzeFootnotes } from "../src/kalci";

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

    const results = analyzeFootnotes(footnotes);
    const total = results.length;
    const issueNumbers = new Set(results.filter((r) => r.findings.length).map((r) => r.number));
    const errors = results.filter((r) => r.findings.some((f) => f.severity === "error")).length;
    const warnings = results.filter((r) => r.findings.some((f) => f.severity === "warning")).length;
    const review = results.filter((r) => r.findings.some((f) => f.severity === "review")).length;
    const correct = Math.max(0, total - issueNumbers.size);
    const score = total ? Math.round((correct / total) * 100) : 0;

    return Response.json({
      style: { name: "KALCI", version: "February 2026" },
      statistics: { total, correct, errors, warnings, requiresReview: review, score },
      sources: Array.from(new Map(
        results.flatMap((r) => r.segments)
          .filter((s) => s.sourceKey)
          .map((s) => [s.sourceKey, {
            key: s.sourceKey,
            name: s.components.title ?? s.raw,
            type: s.sourceType,
            occurrence: s.occurrence,
            firstCitation: s.occurrence === "first" ? s.id : undefined
          }])
      ).values()),
      results
    }, { headers: { "access-control-allow-origin": "*" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }
}
