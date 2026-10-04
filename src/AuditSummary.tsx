import { useMemo } from "react";
import type { CitationResult } from "./kalci";

type AuditSummaryProps = {
  results: CitationResult[];
};

type AuditMetric = {
  label: string;
  value: string;
  detail: string;
};

export default function AuditSummary({ results }: AuditSummaryProps) {
  const audit = useMemo(() => {
    const segments = results.flatMap((result) => result.segments);
    const identified = segments.filter((segment) => segment.sourceType !== "OTHER" && segment.sourceConfidence >= 0.6);
    const sources = new Map<string, CitationResult["segments"][number]>();
    segments.forEach((segment) => {
      if (segment.sourceKey && !sources.has(segment.sourceKey)) sources.set(segment.sourceKey, segment);
    });

    const errorCount = results.reduce((sum, result) => sum + result.findings.filter((finding) => finding.severity === "error").length, 0);
    const warningCount = results.reduce((sum, result) => sum + result.findings.filter((finding) => finding.severity === "warning").length, 0);
    const reviewCount = results.reduce((sum, result) => sum + result.findings.filter((finding) => finding.severity === "review").length, 0);
    const safeFixCount = segments.filter((segment) => segment.edits.length > 0 && segment.edits.every((edit) => edit.safe)).length;
    const recurring = Array.from(sources.values()).filter((segment) => (segment.sourceOccurrenceCount ?? 1) > 1);
    const inconsistent = segments.filter((segment) => (segment.sourceOccurrence ?? 1) > 1 && segment.findings.some((finding) => finding.code === "KALCI-OCC-001" || finding.code === "KALCI-BOOK-002"));

    const totalSegments = segments.length;
    const classificationCoverage = totalSegments ? Math.round((identified.length / totalSegments) * 100) : 0;
    const recurrenceCoverage = sources.size ? Math.round((recurring.length / sources.size) * 100) : 0;

    const penalty = results.length
      ? Math.min(100, Math.round(((errorCount * 6) + (warningCount * 2) + reviewCount) / results.length))
      : 0;
    const qualityScore = Math.max(0, 100 - penalty);

    return {
      sourceCount: sources.size,
      totalSegments,
      classificationCoverage,
      recurrenceCoverage,
      recurring: recurring.length,
      inconsistent: inconsistent.length,
      errorCount,
      warningCount,
      reviewCount,
      safeFixCount,
      qualityScore
    };
  }, [results]);

  const metrics: AuditMetric[] = [
    {
      label: "Citation quality",
      value: `${audit.qualityScore}%`,
      detail: "weighted heuristic: errors carry more weight than warnings or review items"
    },
    {
      label: "Source identification",
      value: `${audit.classificationCoverage}%`,
      detail: `${audit.sourceCount} source identities tracked across ${audit.totalSegments} citation segments`
    },
    {
      label: "Recurring-source coverage",
      value: `${audit.recurrenceCoverage}%`,
      detail: `${audit.recurring} source identit${audit.recurring === 1 ? "y recurs" : "ies recur"} in the document`
    },
    {
      label: "Human review load",
      value: String(audit.reviewCount),
      detail: `${audit.inconsistent} recurring occurrence${audit.inconsistent === 1 ? "" : "s"} need source-form review`
    }
  ];

  return (
    <section className="audit-summary">
      <div className="panel-head">
        <div>
          <h2>Document citation audit</h2>
          <span>explainable document-level signals, not just isolated errors</span>
        </div>
        <span className="audit-badge">{audit.safeFixCount} safe fix{audit.safeFixCount === 1 ? "" : "es"} available</span>
      </div>
      <div className="audit-grid">
        {metrics.map((metric) => (
          <article className="audit-card" key={metric.label}>
            <span>{metric.label}</span>
            <b>{metric.value}</b>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
      <div className="audit-findings">
        <div><b>{audit.errorCount}</b><span>objective errors</span></div>
        <div><b>{audit.warningCount}</b><span>warnings</span></div>
        <div><b>{audit.reviewCount}</b><span>review items</span></div>
        <div><b>{audit.inconsistent}</b><span>source-form inconsistencies</span></div>
      </div>
    </section>
  );
}
