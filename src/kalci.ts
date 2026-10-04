export type Severity = "error" | "warning" | "review";

export type CitationFinding = {
  message: string;
  rule: string;
  severity: Severity;
  original: string;
  suggestion?: string;
};

export type CitationResult = {
  number: number;
  text: string;
  sourceType: string;
  occurrence: "first" | "subsequent" | "unknown";
  findings: CitationFinding[];
  correctedText: string;
};

const LATINISMS: Record<string, string> = {
  "et al.": "and others",
  "et al": "and others",
  "inter alia": "among other things",
  "prima facie": "at first instance",
  "per se": "in itself"
};

const SOURCE_PATTERNS: Array<[string, RegExp]> = [
  ["case", /\b(?:v\.|versus)\b|\[?\d{4}\]?\s*(?:eKLR|KLR|EA|AC|UKSC|EWCA|USSC)\b/i],
  ["legislation", /\b(?:Act|Bill|Regulations?|Rules?|Constitution)\b/i],
  ["journal article", /\b(?:Journal|Law Review|Law Quarterly|Review)\b/i],
  ["internet resource", /https?:\/\//i],
  ["book", /\b(?:Press|Publishers?|University|Ltd\.|Limited)\b/i]
];

function canonical(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sourceFingerprint(text: string, sourceType: string): string | null {
  const clean = canonical(text);
  if (!clean) return null;

  if (sourceType === "case") {
    const match = clean.match(/^(.{3,160}?\b(?:v\.|versus)\b.{0,180}?)(?:,|\.|;|\s*\[?\d{4})/i);
    return match ? "case|" + match[1].replace(/\W+/g, " ").trim() : "case|" + clean.slice(0, 120);
  }

  if (sourceType === "legislation") {
    const match = clean.match(/([a-z][a-z &'’-]{2,100}\b(?:act|bill|regulations?|rules?|constitution)\b(?:\s*\d{4})?)/i);
    return match ? "legislation|" + match[1].replace(/\W+/g, " ").trim() : "legislation|" + clean.slice(0, 120);
  }

  const beforePublisher = clean.split(/,\s*(?:[^,]*press|[^,]*publishers?|[^,]*university|[^,]*ltd\.?|[^,]*limited)\s*,/i)[0];
  const parts = beforePublisher.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return sourceType + "|" + parts[0] + "|" + parts[1].replace(/[.]/g, "");
  }
  return sourceType + "|" + clean.slice(0, 120);
}

function detectSourceType(text: string): string {
  for (const [name, pattern] of SOURCE_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return "other";
}

function tidyFootnote(text: string): string {
  let value = text.trim();

  value = value.replace(/\b(F\.?\s*[A-Z]\.)\b/g, (m) => m.replace(/\./g, "").replace(/\s+/g, ""));
  value = value.replace(/\b([A-Z])\.\s*([A-Z])\.\b/g, "$1$2");

  value = value.replace(/\bet\s+al\.?\b/gi, "and others");
  value = value.replace(/\binter\s+alia\b/gi, "among other things");
  value = value.replace(/\bprima\s+facie\b/gi, "at first instance");
  value = value.replace(/\bper\s+se\b/gi, "in itself");

  value = value.replace(/\s+&\s+/g, " and ");
  value = value.replace(/\s*\/\s*/g, " or ");
  value = value.replace(/\bp\.?\s+(?=\d)/gi, "");

  if (!/[.!?]$/.test(value)) value += ".";
  return value.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

function analyzeOne(text: string, number: number, registry: Map<string, number>): CitationResult {
  const sourceType = detectSourceType(text);
  const fingerprint = sourceFingerprint(text, sourceType);
  const findings: CitationFinding[] = [];
  let correctedText = text.trim();

  if (/\bet\s+al\.?\b/i.test(text)) {
    findings.push({
      message: "Avoid Latinisms in KALCI citation text; use “and others” where the meaning is required.",
      rule: "KALCI Guide, language and style",
      severity: "error",
      original: text
    });
  }

  if (/\b(?:inter\s+alia|prima\s+facie|per\s+se)\b/i.test(text)) {
    findings.push({
      message: "Replace the Latin expression with the plain-English wording required by KALCI.",
      rule: "KALCI Guide, language and style",
      severity: "error",
      original: text
    });
  }

  if (/\b[A-Z]\.\s*[A-Z]\.\b/.test(text)) {
    findings.push({
      message: "Initials should not contain full stops.",
      rule: "KALCI Guide, abbreviations",
      severity: "error",
      original: text
    });
  }

  if (/\bp\.?\s+\d+/i.test(text)) {
    findings.push({
      message: "Page numbers should appear at the end without “p”.",
      rule: "KALCI Guide, page and paragraph numbers",
      severity: "error",
      original: text
    });
  }

  if (/[&]/.test(text)) {
    findings.push({
      message: "Use “and” rather than “&” where KALCI calls for words.",
      rule: "KALCI Guide, symbols and punctuation",
      severity: "warning",
      original: text
    });
  }

  if (/\//.test(text)) {
    findings.push({
      message: "Avoid the slash symbol where the meaning can be expressed in words.",
      rule: "KALCI Guide, symbols and punctuation",
      severity: "warning",
      original: text
    });
  }

  if (/[.!?]$/.test(text) === false) {
    findings.push({
      message: "The citation should end with a full stop.",
      rule: "KALCI Guide, punctuation",
      severity: "error",
      original: text
    });
  }

  if (fingerprint) {
    const previous = registry.get(fingerprint);
    if (previous == null) {
      registry.set(fingerprint, number);
    }
  }

  const occurrence: CitationResult["occurrence"] = fingerprint
    ? registry.get(fingerprint) === number
      ? "first"
      : "subsequent"
    : "unknown";

  if (occurrence === "subsequent" && sourceType === "book") {
    findings.push({
      message: "This source appears to be a subsequent book citation. KALCI uses the author’s second name in subsequent mention rather than repeating the full author form.",
      rule: "KALCI Guide, books — subsequent mention",
      severity: "review",
      original: text,
      suggestion: "Review the short subsequent form for the source."
    });
  }

  correctedText = tidyFootnote(text);

  if (correctedText !== text.trim()) {
    const suggestion = correctedText;
    for (const finding of findings) {
      if (!finding.suggestion) finding.suggestion = suggestion;
    }
  }

  return { number, text, sourceType, occurrence, findings, correctedText };
}

export function analyzeFootnotes(raw: string[]): CitationResult[] {
  const registry = new Map<string, number>();
  return raw
    .map((text, index) => analyzeOne(text, index + 1, registry))
    .filter((result) => result.text.trim().length > 0);
}

export const KALCI_RULES = [
  ["Language", "Prefer plain English; avoid Latinisms such as et al., inter alia, prima facie and per se."],
  ["Abbreviations", "Use initials without full stops and introduce abbreviations before using their shortened form."],
  ["Punctuation", "Citations end with a full stop and punctuation generally follows KALCI placement rules."],
  ["Page numbers", "Do not use p before a page number; paragraph numbers use para."],
  ["Symbols", "Prefer words such as and or rather than & and slash constructions where appropriate."],
  ["Books", "Author(s), Title, Publisher, year, page. Subsequent mention uses the second name."],
  ["Formatting", "Main text: Times New Roman 12, 1.5 line spacing. Footnotes: Calibri Body 10, single spacing."]
] as const;