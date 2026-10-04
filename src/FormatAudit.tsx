import type { DocxFormatAudit } from "./docx";

type Props = { audit: DocxFormatAudit | null };

function value(value: string | number | undefined, fallback = "Not directly specified") {
  return value === undefined ? fallback : String(value);
}

export default function FormatAudit({ audit }: Props) {
  if (!audit) return null;

  const passed = audit.findings.length === 0;
  return (
    <section className="format-audit">
      <div className="panel-head">
        <div>
          <h2>Word document format audit</h2>
          <span>direct OOXML formatting observations · inherited styles are not inferred</span>
        </div>
        <span className={passed ? "format-status good" : "format-status"}>{passed ? "No direct conflicts found" : `${audit.findings.length} finding${audit.findings.length === 1 ? "" : "s"}`}</span>
      </div>

      <div className="format-grid">
        <article>
          <b>Main text</b>
          <span>Font</span><strong>{value(audit.main.font)}</strong>
          <span>Size</span><strong>{audit.main.sizePt === undefined ? "Not directly specified" : `${audit.main.sizePt} pt`}</strong>
          <span>Line spacing</span><strong>{value(audit.main.lineSpacing)}</strong>
        </article>

        <article>
          <b>Footnotes</b>
          <span>Font</span><strong>{value(audit.footnotes.font)}</strong>
          <span>Size</span><strong>{audit.footnotes.sizePt === undefined ? "Not directly specified" : `${audit.footnotes.sizePt} pt`}</strong>
          <span>Line spacing</span><strong>{value(audit.footnotes.lineSpacing)}</strong>
        </article>

        <article>
          <b>Page margins</b>
          <span>Top / right</span><strong>{audit.marginsCm ? `${value(audit.marginsCm.top)} / ${value(audit.marginsCm.right)} cm` : "Not available"}</strong>
          <span>Bottom / left</span><strong>{audit.marginsCm ? `${value(audit.marginsCm.bottom)} / ${value(audit.marginsCm.left)} cm` : "Not available"}</strong>
          <span>Target</span><strong>2 cm on each side</strong>
        </article>
      </div>

      {!passed && (
        <div className="format-findings">
          {audit.findings.map((finding, index) => <div key={index}>• {finding}</div>)}
        </div>
      )}
    </section>
  );
}
