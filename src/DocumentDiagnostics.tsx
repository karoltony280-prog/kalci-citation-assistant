import { useMemo } from "react";
import type { CitationResult, CitationSegment } from "./kalci";

type Props = { results: CitationResult[] };

type Diagnostic = {
  severity: "error" | "warning" | "review";
  title: string;
  detail: string;
  footnotes: number[];
};

function fnOf(segment: CitationSegment) {
  return Number(segment.id.split("-")[0]);
}

export default function DocumentDiagnostics({ results }: Props) {
  const diagnostics = useMemo<Diagnostic[]>(() => {
    const segments = results.flatMap((result) => result.segments);
    const bySource = new Map<string, CitationSegment[]>();

    for (const segment of segments) {
      if (!segment.sourceKey) continue;
      const group = bySource.get(segment.sourceKey) ?? [];
      group.push(segment);
      bySource.set(segment.sourceKey, group);
    }

    const output: Diagnostic[] = [];

    for (const group of bySource.values()) {
      group.sort((a, b) => (a.sourceOccurrence ?? 0) - (b.sourceOccurrence ?? 0));
      const first = group[0];
      const later = group.slice(1);

      if (!first) continue;

      const inconsistent = later.filter((segment) =>
        segment.findings.some((finding) => finding.code === "KALCI-OCC-001" || finding.code === "KALCI-BOOK-002")
      );

      if (inconsistent.length) {
        output.push({
          severity: "review",
          title: "Recurring source has form inconsistencies",
          detail: `${inconsistent.length} later occurrence${inconsistent.length === 1 ? "" : "s"} of “${first.components.title ?? first.raw}” differ from the expected subsequent structure.`,
          footnotes: inconsistent.map(fnOf)
        });
      }

      const repeatedFullForms = later.filter((segment) =>
        first.sourceType === "BOOK" &&
        segment.components.publisher &&
        segment.components.year &&
        /,\s*\d{4}\b/.test(segment.raw)
      );

      if (repeatedFullForms.length) {
        output.push({
          severity: "warning",
          title: "Full publication details repeated after first citation",
          detail: `The source appears to repeat publisher/year information after its first occurrence. Check whether KALCI's subsequent form should be used.`,
          footnotes: repeatedFullForms.map(fnOf)
        });
      }

      if (later.length && later.some((segment) => segment.sourceOccurrence !== undefined && segment.sourceOccurrence < 2)) {
        output.push({
          severity: "error",
          title: "Source occurrence index is inconsistent",
          detail: "The document source chain contains a later citation whose occurrence index is not at least 2.",
          footnotes: later.map(fnOf)
        });
      }
    }

    const lowConfidence = segments.filter((segment) => segment.sourceConfidence < 0.6);
    if (lowConfidence.length) {
      output.push({
        severity: "review",
        title: "Low-confidence source classifications",
        detail: `${lowConfidence.length} citation segment${lowConfidence.length === 1 ? "" : "s"} should be confirmed before structural correction.`,
        footnotes: lowConfidence.map(fnOf)
      });
    }

    const duplicateFirstClaims = new Map<string, number[]>();
    for (const segment of segments) {
      if (segment.occurrence === "first" && segment.sourceKey) {
        const list = duplicateFirstClaims.get(segment.sourceKey) ?? [];
        list.push(fnOf(segment));
        duplicateFirstClaims.set(segment.sourceKey, list);
      }
    }

    for (const [key, footnotes] of duplicateFirstClaims) {
      if (footnotes.length > 1) {
        output.push({
          severity: "error",
          title: "Multiple first citations for one source identity",
          detail: `KALCI matched one source identity (${key}) to more than one “first” occurrence. Review whether the source appears in materially different forms.`,
          footnotes
        });
      }
    }

    return output.sort((a, b) => {
      const weight = { error: 0, warning: 1, review: 2 };
      return weight[a.severity] - weight[b.severity];
    });
  }, [results]);

  return (
    <section className="document-diagnostics">
      <div className="panel-head">
        <div>
          <h2>Document-wide diagnostics</h2>
          <span>cross-footnote consistency and source-chain checks</span>
        </div>
        <span className={diagnostics.length ? "diagnostic-count" : "diagnostic-count clean"}>
          {diagnostics.length ? `${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}` : "Document chain is clean"}
        </span>
      </div>

      {diagnostics.length ? (
        <div className="diagnostic-list">
          {diagnostics.map((item, index) => (
            <article className="diagnostic-item" key={item.title + item.footnotes.join("-") + index}>
              <span className={`diagnostic-severity ${item.severity}`}>{item.severity}</span>
              <div>
                <b>{item.title}</b>
                <p>{item.detail}</p>
                <small>Footnotes: {item.footnotes.join(", ")}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="diagnostic-empty">✓ No cross-footnote inconsistency was detected by the current deterministic chain checks.</div>
      )}
    </section>
  );
}
