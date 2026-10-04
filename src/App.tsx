import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeFootnotes, KALCI_RULES, type CitationResult } from "./kalci";
import { extractDocxFootnotesFromFile } from "./docx";
import { loadKalciCatalog, loadKalciStyle, supabaseConfigured, type KalciSourceType, type KalciTemplate } from "./supabase";

const SAMPLE = [
  "FX Njenga, International Law and World Order Problems, Moi University Press, 2001, p 21",
  "Njenga, International Law and World Order Problems, Moi University Press, 2001, 35.",
  "See inter alia the principles discussed in the Constitution of Kenya, 2010; Mitu-Bell Welfare Society v Kenya Airports Authority [2013] eKLR",
  "See also Kenya National Commission on Human Rights & others / Attorney General."
];

export default function App() {
  const [value, setValue] = useState(SAMPLE.join("\n"));
  const [results, setResults] = useState<CitationResult[]>(() => analyzeFootnotes(SAMPLE));
  const [active, setActive] = useState<"checker" | "rules" | "word">("checker");
  const [dbStyle, setDbStyle] = useState<{name:string;version:string;status:string} | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [sourceTypes, setSourceTypes] = useState<KalciSourceType[]>([]);
  const [templates, setTemplates] = useState<KalciTemplate[]>([]);
  const [selectedType, setSelectedType] = useState("BOOK");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadKalciStyle().then(setDbStyle).catch((error) => setDbError(error instanceof Error ? error.message : String(error)));
    loadKalciCatalog()
      .then((catalog) => {
        setSourceTypes(catalog.sourceTypes);
        setTemplates(catalog.templates);
      })
      .catch((error) => setDbError(error instanceof Error ? error.message : String(error)));
  }, []);

  const stats = useMemo(() => {
    const errors = results.filter((r) => r.findings.some((f) => f.severity === "error")).length;
    const warnings = results.filter((r) => r.findings.some((f) => f.severity === "warning")).length;
    const review = results.filter((r) => r.findings.some((f) => f.severity === "review")).length;
    const clean = results.filter((r) => r.findings.length === 0).length;
    const score = results.length ? Math.round((clean / results.length) * 100) : 0;
    const sources = new Set(results.flatMap((r) => r.segments).map((s) => s.sourceKey).filter(Boolean));
    return { total: results.length, errors, warnings, review, clean, score, sources: sources.size };
  }, [results]);

  const selectedSource = sourceTypes.find((source) => source.code === selectedType);
  const selectedTemplates = templates.filter((template) => template.source_type_id === selectedSource?.id);

  function runCheck() {
    setResults(analyzeFootnotes(value.split(/\r?\n/)));
  }

  function applyAll() {
    const corrected = results.map((r) => r.correctedText).join("\n");
    setValue(corrected);
    setResults(analyzeFootnotes(corrected.split(/\r?\n/)));
  }

  async function importDocx(file: File) {
    setImporting(true);
    try {
      const footnotes = await extractDocxFootnotesFromFile(file);
      if (!footnotes.length) throw new Error("No numbered footnotes were found in this Word document.");
      const imported = footnotes.map((item) => item.raw);
      setValue(imported.join("\n"));
      setResults(analyzeFootnotes(imported));
      setDocumentName(file.name);
      setActive("checker");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="crest">K</div>
          <div>
            <div className="brand-name">KALCI</div>
            <div className="brand-sub">Citation Assistant</div>
          </div>
        </div>
        <nav>
          <button className={active === "checker" ? "nav active" : "nav"} onClick={() => setActive("checker")}>Checker</button>
          <button className={active === "rules" ? "nav active" : "nav"} onClick={() => setActive("rules")}>KALCI rules</button>
          <button className={active === "word" ? "nav active" : "nav"} onClick={() => setActive("word")}>Word Add-in</button>
        </nav>
      </header>

      <main>
        {active === "checker" && (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">DOCUMENT-AWARE LEGAL CITATION INTELLIGENCE</span>
                <h1>Check the citation.<br /><span>Track the source.</span></h1>
                <p>Import a real Word document or paste footnotes. KALCI reads the document's footnote stream, identifies source recurrence and compound citations, then applies deterministic rules before asking for human review.</p>
                <div className="connection">
                  <span className={dbStyle ? "dot online" : dbError ? "dot offline" : "dot"}></span>
                  {dbStyle ? `KALCI database connected · ${dbStyle.version}` : dbError ? "Local engine active · database unavailable" : supabaseConfigured ? "Connecting to KALCI database…" : "Local engine active"}
                </div>
              </div>
              <div className="score-card">
                <span>DOCUMENT SCORE</span>
                <strong>{stats.score}%</strong>
                <small>{stats.total} footnotes · {stats.sources} tracked sources</small>
              </div>
            </section>

            <section className="import-bar">
              <div>
                <b>{documentName ?? "No Word document imported"}</b>
                <span>{documentName ? "Footnotes extracted from the uploaded .docx file" : "Upload a .docx to analyse its actual Word footnotes"}</span>
              </div>
              <div className="import-actions">
                <input ref={fileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => e.target.files?.[0] && importDocx(e.target.files[0])} />
                <button className="secondary" disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? "Reading Word document…" : "Import .docx"}</button>
                <button className="ghost" onClick={() => { setDocumentName(null); setValue(SAMPLE.join("\n")); setResults(analyzeFootnotes(SAMPLE)); }}>Load sample</button>
              </div>
            </section>

            <section className="stat-grid">
              <div><b>{stats.clean}</b><span>Correct</span></div>
              <div><b>{stats.errors}</b><span>Errors</span></div>
              <div><b>{stats.warnings}</b><span>Warnings</span></div>
              <div><b>{stats.review}</b><span>Review</span></div>
            </section>

            <section className="workspace">
              <div className="panel">
                <div className="panel-head">
                  <div><h2>Footnotes</h2><span>one footnote per line · use ; for compound citations</span></div>
                  <button className="ghost" onClick={() => setValue("")}>Clear</button>
                </div>
                <textarea value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
                <div className="actions">
                  <button className="primary" onClick={runCheck}>Analyse document</button>
                  <button className="secondary" onClick={applyAll}>Apply safe corrections</button>
                </div>
              </div>

              <div className="panel findings">
                <div className="panel-head">
                  <div><h2>Findings</h2><span>objective rules first · interpretation marked for review</span></div>
                </div>
                {results.map((r) => (
                  <article className={r.findings.length ? "finding issue" : "finding"} key={r.number}>
                    <div className="finding-top">
                      <span className="note-no">FN {r.number}</span>
                      <span className="source-chip">{r.sourceType}</span>
                      <span className="occ">{r.segments.length > 1 ? `${r.segments.length} citations` : r.occurrence}</span>
                    </div>
                    <p className="citation">{r.text}</p>
                    {r.segments.length > 1 && (
                      <div className="segments">
                        {r.segments.map((s) => (
                          <div className="segment" key={s.id}>
                            <div><b>{s.sourceType}</b><span>{s.occurrence}</span></div>
                            <p>{s.raw}</p>
                            {s.correctedText !== s.raw && (
                              <div className="correction-preview">
                                <small>Safe correction</small>
                                <div><span>Before</span><p>{s.raw}</p></div>
                                <div><span>After</span><p>{s.correctedText}</p></div>
                                {s.correctionReason && <em>{s.correctionReason}</em>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {r.segments.length === 1 && r.segments[0].correctedText !== r.text && (
                      <div className="correction-preview">
                        <small>Safe correction preview</small>
                        <div><span>Before</span><p>{r.text}</p></div>
                        <div><span>After</span><p>{r.correctedText}</p></div>
                        {r.segments[0].correctionReason && <em>{r.segments[0].correctionReason}</em>}
                      </div>
                    )}
                    {r.findings.length === 0 ? (
                      <div className="ok">✓ No flagged KALCI issue</div>
                    ) : (
                      r.findings.map((f, i) => (
                        <div className="rule-row" key={i}>
                          <span className={"severity " + f.severity}>{f.severity}</span>
                          <div><b>{f.message}</b><small>{f.code} · {f.rule}{f.safeToApply ? " · safe to apply" : ""}</small>{f.suggestion && <em>Suggested: {f.suggestion}</em>}</div>
                        </div>
                      ))
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {active === "rules" && (
          <section className="rules-page">
            <span className="eyebrow">KABARAK UNIVERSITY LEGAL CITATION GUIDE</span>
            <h1>The KALCI rulebook and source taxonomy.</h1>
            <p className="lead">The database now holds the full source-type catalogue and first/subsequent templates represented by the February 2026 guide. The engine uses deterministic checks for objective rules and leaves interpretation visible for review.</p>
            <div className="catalog-controls">
              <label>
                <span>Source type</span>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                  {sourceTypes.map((source) => <option value={source.code} key={source.code}>{source.name}</option>)}
                </select>
              </label>
              {selectedSource && <div className="catalog-description"><b>{selectedSource.name}</b><p>{selectedSource.description}</p></div>}
            </div>
            <div className="template-grid">
              {selectedTemplates.length ? selectedTemplates.map((template) => (
                <div className="template-card" key={template.citation_stage}>
                  <div className="template-stage">{template.citation_stage}</div>
                  <h3>Expected form</h3>
                  <p className="template-text">{template.template_text}</p>
                  <h3>Example</h3>
                  <p>{template.example}</p>
                  {template.notes && <small>{template.notes}</small>}
                </div>
              )) : <div className="install-box"><b>Template not yet loaded.</b><p>Reconnect to the KALCI database to retrieve this source type.</p></div>}
            </div>
            <h2 className="catalog-heading">General machine checks</h2>
            <div className="rule-cards">
              {KALCI_RULES.map(([name, text]) => <div className="rule-card" key={name}><b>{name}</b><p>{text}</p></div>)}
            </div>
          </section>
        )}

        {active === "word" && (
          <section className="rules-page">
            <span className="eyebrow">MICROSOFT WORD</span>
            <h1>Use KALCI inside the document.</h1>
            <p className="lead">The companion Office Add-in reads actual Word footnotes and sends them through the same KALCI analysis endpoint used by the web application.</p>
            <div className="install-box">
              <h2>Word Add-in manifest</h2>
              <p><a href="/addin/manifest.xml" target="_blank" rel="noreferrer">Open the KALCI manifest</a> and sideload it into Word. The task pane is served from this Vercel deployment.</p>
              <p className="muted">The add-in requests ReadWriteDocument permission and WordApi 1.5 for direct footnote access.</p>
            </div>
          </section>
        )}
      </main>

      <footer>© KALCI Citation Assistant · Kabarak University legal citation workflow</footer>
    </div>
  );
}