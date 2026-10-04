const state = { findings: [], footnotes: [] };

const rules = [
  [/\bet\s+al\.?\b/i, "Avoid Latinisms; use “and others”.", "KALCI Guide, language and style"],
  [/\b(?:inter\s+alia|prima\s+facie|per\s+se)\b/i, "Replace the Latin expression with plain-English wording.", "KALCI Guide, language and style"],
  [/\b[A-Z]\.\s*[A-Z]\.\b/, "Initials should not contain full stops.", "KALCI Guide, abbreviations"],
  [/\bp\.?\s+\d+/i, "Page numbers should appear without “p”.", "KALCI Guide, page numbers"],
  [/&/, "Use “and” rather than “&” where KALCI calls for words.", "KALCI Guide, symbols"],
  [/\//, "Avoid slash constructions where words are appropriate.", "KALCI Guide, symbols"]
];

function sourceType(text) {
  if (/\b(?:v\.|versus)\b|\[?\d{4}\]?\s*(?:eKLR|KLR|EA)\b/i.test(text)) return "case";
  if (/\b(?:Act|Bill|Regulations?|Rules?|Constitution)\b/i.test(text)) return "legislation";
  if (/https?:\/\//i.test(text)) return "internet resource";
  if (/\b(?:Journal|Law Review|Review)\b/i.test(text)) return "journal article";
  return "book / other";
}

function fingerprint(text, type) {
  const clean = text.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const parts = clean.split(",");
  if (type === "case") return "case|" + clean.slice(0, 120);
  if (type === "legislation") return "legislation|" + clean.match(/[a-z][a-z &'’-]{2,80}\b(?:act|bill|regulations?|rules?|constitution)\b(?:\s*\d{4})?/i)?.[0] || clean.slice(0, 100);
  return type + "|" + parts.slice(0,2).join("|").replace(/[^a-z0-9 ]/gi,"").trim();
}

function corrected(text) {
  return text.trim()
    .replace(/\b([A-Z])\.\s*([A-Z])\.\b/g, "$1$2")
    .replace(/\bet\s+al\.?\b/gi, "and others")
    .replace(/\binter\s+alia\b/gi, "among other things")
    .replace(/\bprima\s+facie\b/gi, "at first instance")
    .replace(/\bper\s+se\b/gi, "in itself")
    .replace(/\s+&\s+/g, " and ")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/\bp\.?\s+(?=\d)/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[.!?]$/.test(text.trim()) ? /$^/ : /$/g, (m) => m)
    .replace(/\s+/g, " ")
    .trim() + (/[^.!?]$/.test(text.trim()) ? "." : "");
}

function analyse(text, number, registry) {
  const type = sourceType(text);
  const key = fingerprint(text, type);
  const findings = [];
  rules.forEach(([re, message, rule]) => { if (re.test(text)) findings.push({message, rule}); });
  if (!/[.!?]$/.test(text.trim())) findings.push({message:"The citation should end with a full stop.", rule:"KALCI Guide, punctuation"});
  const occurrence = key ? (registry.has(key) ? "subsequent" : "first") : "unknown";
  if (key && !registry.has(key)) registry.set(key, number);
  return {number, text, type, occurrence, findings, corrected: corrected(text)};
}

async function scan() {
  const status = document.getElementById("status");
  const findingsHost = document.getElementById("findings");
  const statsHost = document.getElementById("stats");
  state.findings = [];
  state.footnotes = [];
  status.textContent = "Reading the document footnotes…";
  try {
    await Word.run(async (context) => {
      const collection = context.document.body.footnotes;
      collection.load("items");
      await context.sync();

      collection.items.forEach((item) => item.body.load("text"));
      await context.sync();

      const registry = new Map();
      collection.items.forEach((item, index) => {
        const text = (item.body.text || "").trim();
        if (text) state.findings.push(analyse(text, index + 1, registry));
        state.footnotes.push(item);
      });

      const issueCount = state.findings.filter((x) => x.findings.length).length;
      const errorCount = state.findings.reduce((n,x) => n + x.findings.length, 0);

      await markIssues(context);
      status.textContent = `Scanned ${state.findings.length} footnotes. ${issueCount} require attention.`;
      statsHost.innerHTML = `<div><b>${state.findings.length}</b><span>footnotes</span></div><div><b>${issueCount}</b><span>issues</span></div><div><b>${errorCount}</b><span>findings</span></div>`;
      renderFindings(findingsHost);
    });
  } catch (error) {
    status.textContent = "KALCI could not access Word footnotes: " + (error && error.message ? error.message : String(error));
  }
}

async function markIssues(context) {
  state.footnotes.forEach((item, index) => {
    const finding = state.findings.find((x) => x.number === index + 1);
    if (!finding) return;
    const range = item.body.getRange();
    range.font.color = finding.findings.length ? "#9b2525" : "#222222";
    range.font.underline = finding.findings.length ? "Single" : "None";
  });
  await context.sync();
}

async function clearMarks() {
  try {
    await Word.run(async (context) => {
      const collection = context.document.body.footnotes;
      collection.load("items");
      await context.sync();
      collection.items.forEach((item) => { const range = item.body.getRange(); range.font.color = "#222222"; range.font.underline = "None"; });
      await context.sync();
      document.getElementById("status").textContent = "KALCI markings cleared.";
    });
  } catch (error) {
    document.getElementById("status").textContent = "Could not clear markings: " + (error?.message || error);
  }
}

function renderFindings(host) {
  host.innerHTML = state.findings.map((f, i) => {
    const issues = f.findings.length ? f.findings.map(x => `<div class="issue"><b>${escapeHtml(x.message)}</b><small>${escapeHtml(x.rule)}</small></div>`).join("") : '<div style="color:#3b7650;font-size:11px">✓ No flagged issue</div>';
    const action = f.findings.length && f.corrected !== f.text ? `<div class="actions"><button class="apply" onclick="applyOne(${i})">Apply correction</button><button onclick="selectOne(${i})">Go to footnote</button></div><div class="suggest">Suggested: ${escapeHtml(f.corrected)}</div>` : "";
    return `<div class="finding"><div class="top"><span class="num">FN ${f.number}</span><span class="pill">${escapeHtml(f.type)}</span><span class="pill">${escapeHtml(f.occurrence)}</span></div><div class="citation">${escapeHtml(f.text)}</div>${issues}${action}</div>`;
  }).join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function applyOne(index) {
  const finding = state.findings[index];
  if (!finding) return;
  try {
    await Word.run(async (context) => {
      const item = context.document.body.footnotes.items[finding.number - 1];
      item.body.insertText(finding.corrected, "Replace");
      await context.sync();
    });
    await scan();
  } catch (error) {
    document.getElementById("status").textContent = "Could not apply correction: " + (error?.message || error);
  }
}

async function selectOne(index) {
  const finding = state.findings[index];
  if (!finding) return;
  try {
    await Word.run(async (context) => {
      const item = context.document.body.footnotes.items[finding.number - 1];
      item.reference.select();
      await context.sync();
    });
  } catch (error) {
    document.getElementById("status").textContent = "Could not navigate to footnote: " + (error?.message || error);
  }
}

document.getElementById("scan").addEventListener("click", scan);
document.getElementById("clear").addEventListener("click", clearMarks);
if (window.Office) Office.onReady(() => { document.getElementById("status").textContent = "Ready. Click “Scan footnotes”."; });
else document.getElementById("status").textContent = "Open this page inside Microsoft Word to use document scanning.";
window.applyOne = applyOne;
window.selectOne = selectOne;