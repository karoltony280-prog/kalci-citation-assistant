import { useMemo, useState } from "react";
import { analyzeFootnotes, KALCI_RULES, type CitationResult } from "./kalci";

const SAMPLE = [
  "FX Njenga, International Law and World Order Problems, Moi University Press, 2001, p 21",
  "FX Njenga, International Law and World Order Problems, Moi University Press, 2001, 35.",
  "See inter alia the principles discussed in the Constitution of Kenya, 2010",
  "See also Kenya National Commission on Human Rights & others / Attorney General."
];

export default function App() {
  const [value, setValue] = useState(SAMPLE.join("\n"));
  const [results, setResults] = useState<CitationResult[]>(() => analyzeFootnotes(SAMPLE));
  const [active, setActive] = useState<"checker" | "rules" | "word">("checker");

  const stats = useMemo(() => {
    const errors = results.filter((r) => r.findings.some((f) => f.severity === "error")).length;
    const warnings = results.filter((r) => r.findings.some((f) => f.severity === "warning")).length;
    const review = results.filter((r) => r.findings.some((f) => f.severity === "review")).length;
    const clean = results.length - new Set(
      results.filter((r) => r.findings.length > 0).map((r) => r.number)
    ).size;
    const score = results.length ? Math.max(0, Math.round((clean / results.length) * 100)) : 0;
    return { total: results.length, errors, warnings, review, clean, score };
  }, [results]);

  function runCheck() {
    setResults(analyzeFootnotes(value.split(/\r?\n/)));
  }

  function applyAll() {
    const corrected = results.map((r) => r.correctedText).join("\n");
    setValue(corrected);
    setResults(analyzeFootnotes(corrected.split(/\r?\n/)));
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
                <p>Paste one footnote per line. KALCI analyses citation language, punctuation and source recurrence so first and subsequent mentions are treated as document-level events rather than isolated strings.</p>
              </div>
              <div className="score-card">
                <span>DOCUMENT SCORE</span>
                <strong>{stats.score}%</strong>
                <small>{stats.total} footnotes analysed</small>
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
                  <div><h2>Footnotes</h2><span>one citation per line</span></div>
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
                  <div><h2>Findings</h2><span>deterministic KALCI checks</span></div>
                </div>
                {results.map((r) => (
                  <article className={r.findings.length ? "finding issue" : "finding"} key={r.number}>
                    <div className="finding-top">
                      <span className="note-no">FN {r.number}</span>
                      <span className="source-chip">{r.sourceType}</span>
                      <span className="occ">{r.occurrence}</span>
                    </div>
                    <p className="citation">{r.text}</p>
                    {r.findings.length === 0 ? (
                      <div className="ok">✓ No flagged KALCI issue</div>
                    ) : (
                      r.findings.map((f, i) => (
                        <div className="rule-row" key={i}>
                          <span className={"severity " + f.severity}>{f.severity}</span>
                          <div><b>{f.message}</b><small>{f.rule}</small>{f.suggestion && <em>Suggested: {f.suggestion}</em>}</div>
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
            <h1>Rule engine built around the guide.</h1>
            <p className="lead">The application treats the guide as the authority for objective formatting checks. Interpretation is separated for later review rather than silently guessed.</p>
            <div className="rule-cards">
              {KALCI_RULES.map(([name, text]) => <div className="rule-card" key={name}><b>{name}</b><p>{text}</p></div>)}
            </div>
          </section>
        )}

        {active === "word" && (
          <section className="rules-page">
            <span className="eyebrow">MICROSOFT WORD</span>
            <h1>Use KALCI inside the document.</h1>
            <p className="lead">The companion Office Add-in reads actual Word footnotes through Word JavaScript API 1.5, displays issues, navigates to a footnote and can replace its text with a suggested correction.</p>
            <div className="install-box">
              <h2>Word Add-in manifest</h2>
              <p>Download the manifest from <a href="/addin/manifest.xml" target="_blank" rel="noreferrer">/addin/manifest.xml</a> and sideload it in Word. The task pane is hosted by this Vercel deployment.</p>
              <p className="muted">The Word add-in requires WordApi 1.5 or later for direct footnote access.</p>
            </div>
          </section>
        )}
      </main>

      <footer>© KALCI Citation Assistant · Kabarak University legal citation workflow</footer>
    </div>
  );
}