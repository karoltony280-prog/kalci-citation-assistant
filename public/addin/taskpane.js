const state = { findings: [], footnotes: [], sources: [] };

async function scan() {
  const status = document.getElementById("status");
  status.textContent = "Reading the document footnotes…";

  try {
    await Word.run(async (context) => {
      const collection = context.document.body.footnotes;
      collection.load("items");
      await context.sync();

      collection.items.forEach((item) => item.body.load("text"));
      await context.sync();

      const payload = collection.items.map((item, index) => ({
        footnoteNumber: index + 1,
        raw: (item.body.text || "").trim()
      })).filter((item) => item.raw);

      if (!payload.length) {
        state.findings = [];
        state.footnotes = collection.items;
        render();
        status.textContent = "No footnotes were found in this document.";
        return;
      }

      state.footnotes = collection.items;

      let response;
      try {
        response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ footnotes: payload })
        });
      } catch (_) {
        response = null;
      }

      if (response && response.ok) {
        const analysis = await response.json();
        state.findings = analysis.results;
        state.sources = analysis.sources || [];
        status.textContent = `KALCI scanned ${analysis.statistics.total} footnotes · ${analysis.statistics.errors} errors · ${analysis.statistics.warnings} warnings · ${analysis.statistics.requiresReview} reviews.`;
      } else {
        state.findings = payload.map((item) => localAnalyse(item.raw, item.footnoteNumber));
        state.sources = [];
        status.textContent = "KALCI server analysis unavailable; local checks are being used.";
      }

      renderStats();
      render();
      markIssues(context);
      await context.sync();
    });
  } catch (error) {
    status.textContent = "KALCI could not access Word footnotes: " + (error?.message || String(error));
  }
}

function localAnalyse(text, number) {
  const findings = [];
  if (/\bet\s+al\.?\b/i.test(text)) findings.push({
    message: "Avoid Latinisms; use “and others”.",
    rule: "KALCI Guide, language and style",
    severity: "error"
  });
  if (/\b(?:inter\s+alia|prima\s+facie|per\s+se)\b/i.test(text)) findings.push({
    message: "Replace the Latin expression with plain-English wording.",
    rule: "KALCI Guide, language and style",
    severity: "error"
  });
  if (/\b[A-Z]\.\s*[A-Z]\.\b/.test(text)) findings.push({
    message: "Initials should not contain full stops.",
    rule: "KALCI Guide, abbreviations",
    severity: "error"
  });
  if (/\bp\.?\s+\d+/i.test(text)) findings.push({
    message: "Do not use “p” before a page number.",
    rule: "KALCI Guide, page numbers",
    severity: "error"
  });
  if (/[&]/.test(text)) findings.push({
    message: "Use “and” rather than “&” where appropriate.",
    rule: "KALCI Guide, symbols",
    severity: "warning"
  });
  if (/\//.test(text)) findings.push({
    message: "Avoid slash constructions where words are appropriate.",
    rule: "KALCI Guide, symbols",
    severity: "warning"
  });
  if (!/[.!?]$/.test(text.trim())) findings.push({
    message: "The citation should end with a full stop.",
    rule: "KALCI Guide, punctuation",
    severity: "error"
  });

  let corrected = text.trim()
    .replace(/\b([A-Z])\.\s*([A-Z])\.\b/g, "$1$2")
    .replace(/\bet\s+al\.?\b/gi, "and others")
    .replace(/\binter\s+alia\b/gi, "among other things")
    .replace(/\bprima\s+facie\b/gi, "at first instance")
    .replace(/\bper\s+se\b/gi, "in itself")
    .replace(/\s+&\s+/g, " and ")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/\bp\.?\s+(?=\d)/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[.!?]$/.test(corrected)) corrected += ".";

  return {
    number, text, sourceType: "other", occurrence: "unknown",
    findings, correctedText: corrected, segments: []
  };
}

function markIssues(context) {
  state.footnotes.forEach((item, index) => {
    const finding = state.findings.find((x) => x.number === index + 1);
    const range = item.body.getRange();
    range.font.color = finding?.findings?.length ? "#9b2525" : "#222222";
    range.font.underline = finding?.findings?.length ? "Single" : "None";
  });
}

function renderStats() {
  const total = state.findings.length;
  const issues = state.findings.filter((x) => x.findings?.length).length;
  const errors = state.findings.filter((x) => x.findings?.some((f) => f.severity === "error")).length;
  document.getElementById("stats").innerHTML =
    `<div><b>${total}</b><span>footnotes</span></div>
     <div><b>${issues}</b><span>issues</span></div>
     <div><b>${errors}</b><span>errors</span></div>`;
}

function render() {
  const host = document.getElementById("findings");
  const ledger = document.getElementById("sources");
  if (ledger) {
    ledger.innerHTML = state.sources.length
      ? `<div class="ledger-title">Source chain</div>` + state.sources.map((source) =>
          `<div class="source-row"><b>${escapeHtml(source.name || source.key)}</b><span>${escapeHtml(source.type || "other")}</span><small>${source.occurrenceCount || source.occurrences?.length || 0} occurrence${(source.occurrenceCount || source.occurrences?.length || 0) === 1 ? "" : "s"} · ${Math.round((source.confidence || 0) * 100)}% confidence · FNs ${(source.occurrences || []).map((item) => item.footnote + " (" + item.stage + ")").join(" → ")}</small>${source.forms?.length ? `<div class="source-forms">${source.forms.map((form) => `<span>${escapeHtml(form)}</span>`).join("")}</div>` : ""}</div>`
        ).join("")
      : "";
  }
  host.innerHTML = state.findings.map((f, index) => {
    const type = f.sourceType || "other";
    const occurrence = f.occurrence || "unknown";
    const corrected = f.correctedText || f.corrected || f.text;
    const issues = f.findings?.length
      ? f.findings.map((issue) =>
          `<div class="issue"><b>${escapeHtml(issue.message)}</b><small>${escapeHtml(issue.code ? issue.code + " · " + issue.rule : issue.rule)}</small></div>`
        ).join("")
      : '<div style="color:#3b7650;font-size:11px">✓ No flagged KALCI issue</div>';

    const actions = f.findings?.length && corrected !== f.text
      ? `<div class="actions">
          <button class="apply" onclick="applyOne(${index})">Apply safe corrections</button>
          <button onclick="selectOne(${index})">Go to footnote</button>
        </div>
        <div class="suggest"><b>Before:</b> ${escapeHtml(f.text)}<br><b>After:</b> ${escapeHtml(corrected)}</div>`
      : `<div class="actions"><button onclick="selectOne(${index})">Go to footnote</button></div>`;

    const segments = f.segments?.length > 1
      ? `<div class="suggest">Compound footnote: ${f.segments.length} citations tracked separately.</div>`
      : "";

    return `<div class="finding">
      <div class="top"><span class="num">FN ${f.number}</span><span class="pill">${escapeHtml(type)}</span><span class="pill">${escapeHtml(occurrence)}</span></div>
      <div class="citation">${escapeHtml(f.text)}</div>
      ${segments}
      ${issues}
      ${actions}
    </div>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]
  );
}

async function applyOne(index) {
  const finding = state.findings[index];
  if (!finding) return;

  try {
    await Word.run(async (context) => {
      const item = context.document.body.footnotes.items[finding.number - 1];
      const segments = finding.segments?.length ? finding.segments : [{
        raw: finding.text,
        correctedText: finding.correctedText || finding.corrected
      }];

      let applied = 0;
      for (const segment of segments) {
        if (!segment?.raw || !segment.correctedText || segment.raw === segment.correctedText) continue;
        const matches = item.body.search(segment.raw, { matchCase: true, matchWholeWord: false });
        matches.load("items");
        await context.sync();

        if (!matches.items.length) continue;
        matches.items[0].insertText(segment.correctedText, "Replace");
        applied += 1;
        await context.sync();
      }

      document.getElementById("status").textContent = applied
        ? `Applied ${applied} safe correction${applied === 1 ? "" : "s"} in footnote ${finding.number}.`
        : `No safe correction was applied to footnote ${finding.number}.`;
    });
    await scan();
  } catch (error) {
    document.getElementById("status").textContent = "Could not apply correction: " + (error?.message || String(error));
  }
}

async function selectOne(index) {
  const finding = state.findings[index];
  if (!finding) return;
  try {
    await Word.run(async (context) => {
      context.document.body.footnotes.items[finding.number - 1].reference.select();
      await context.sync();
    });
  } catch (error) {
    document.getElementById("status").textContent = "Could not navigate to footnote: " + (error?.message || String(error));
  }
}

function clearSourceLedger() {
  state.sources = [];
  const ledger = document.getElementById("sources");
  if (ledger) ledger.innerHTML = "";
}


async function auditFormatting() {
  const status = document.getElementById("status");
  const host = document.getElementById("formatAudit");
  status.textContent = "Auditing Word formatting…";
  try {
    await Word.run(async (context) => {
      const main = context.document.body;
      const footnotes = context.document.getFootnoteBody();
      main.font.load("name,size");
      footnotes.font.load("name,size");
      const mainParagraph = main.paragraphs.getFirst();
      const footnoteParagraph = footnotes.paragraphs.getFirst();
      mainParagraph.paragraphFormat.load("lineSpacing");
      footnoteParagraph.paragraphFormat.load("lineSpacing");
      await context.sync();

      const mainFont = main.font.name || "Mixed / inherited";
      const mainSize = main.font.size;
      const footFont = footnotes.font.name || "Mixed / inherited";
      const footSize = footnotes.font.size;
      const mainSpacing = mainParagraph.paragraphFormat.lineSpacing;
      const footSpacing = footnoteParagraph.paragraphFormat.lineSpacing;

      const findings = [];
      if (mainFont !== "Mixed / inherited" && !/times new roman/i.test(mainFont)) findings.push("Main text font should be Times New Roman.");
      if (typeof mainSize === "number" && Math.abs(mainSize - 12) > 0.01) findings.push("Main text size should be 12 pt.");
      if (footFont !== "Mixed / inherited" && !/calibri/i.test(footFont)) findings.push("Footnote font should be Calibri.");
      if (typeof footSize === "number" && Math.abs(footSize - 10) > 0.01) findings.push("Footnote size should be 10 pt.");
      if (typeof mainSpacing === "number" && Math.abs(mainSpacing - 18) > 0.01) findings.push("Main text line spacing should be 1.5 lines.");
      if (typeof footSpacing === "number" && Math.abs(footSpacing - 12) > 0.01) findings.push("Footnote line spacing should be single.");

      host.innerHTML =
        `<div class="format-live-title">Live Word format</div>
         <div class="format-live-grid">
           <div><span>Main font</span><b>${escapeHtml(mainFont)}</b></div>
           <div><span>Main size</span><b>${typeof mainSize === "number" ? mainSize + " pt" : "Mixed / inherited"}</b></div>
           <div><span>Footnote font</span><b>${escapeHtml(footFont)}</b></div>
           <div><span>Footnote size</span><b>${typeof footSize === "number" ? footSize + " pt" : "Mixed / inherited"}</b></div>
           <div><span>Main spacing</span><b>${typeof mainSpacing === "number" ? mainSpacing + " pt" : "Mixed"}</b></div>
           <div><span>Footnote spacing</span><b>${typeof footSpacing === "number" ? footSpacing + " pt" : "Mixed"}</b></div>
         </div>
         ${findings.length ? `<div class="format-live-findings">${findings.map((item) => `<div>• ${escapeHtml(item)}</div>`).join("")}</div>` : '<div class="format-live-ok">✓ Directly observed Word formatting matches the KALCI targets.</div>'}`;
      status.textContent = findings.length
        ? `Formatting audit found ${findings.length} item${findings.length === 1 ? "" : "s"} to review.`
        : "Formatting audit complete. No direct conflicts found.";
    });
  } catch (error) {
    status.textContent = "Could not audit Word formatting: " + (error?.message || String(error));
  }
}

async function clearMarks() {
  try {
    await Word.run(async (context) => {
      const collection = context.document.body.footnotes;
      collection.load("items");
      await context.sync();
      collection.items.forEach((item) => {
        const range = item.body.getRange();
        range.font.color = "#222222";
        range.font.underline = "None";
      });
      await context.sync();
      clearSourceLedger();
      document.getElementById("status").textContent = "KALCI markings cleared.";
    });
  } catch (error) {
    document.getElementById("status").textContent = "Could not clear markings: " + (error?.message || String(error));
  }
}

document.getElementById("scan").addEventListener("click", scan);
document.getElementById("format").addEventListener("click", auditFormatting);
document.getElementById("clear").addEventListener("click", clearMarks);
window.applyOne = applyOne;
window.selectOne = selectOne;

if (window.Office) {
  Office.onReady(() => {
    document.getElementById("status").textContent = "Ready. Click “Scan footnotes”.";
  });
} else {
  document.getElementById("status").textContent = "Open this page inside Microsoft Word to use document scanning.";
}
