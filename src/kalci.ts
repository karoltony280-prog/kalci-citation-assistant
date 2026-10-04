export type Severity = "error" | "warning" | "review";
export type Occurrence = "first" | "subsequent" | "unknown";

export type SourceComponents = {
  author?: string;
  title?: string;
  publisher?: string;
  year?: string;
  page?: string;
  url?: string;
};

export type CitationFinding = {
  code: string;
  message: string;
  rule: string;
  severity: Severity;
  original: string;
  suggestion?: string;
};

export type CitationSegment = {
  id: string;
  raw: string;
  sourceType: string;
  occurrence: Occurrence;
  sourceKey?: string;
  components: SourceComponents;
  findings: CitationFinding[];
  correctedText: string;
};

export type CitationResult = {
  number: number;
  text: string;
  sourceType: string;
  occurrence: Occurrence;
  sourceKey?: string;
  components: SourceComponents;
  findings: CitationFinding[];
  correctedText: string;
  segments: CitationSegment[];
};

const SOURCE_PATTERNS: Array<[string, RegExp]> = [
  ["case", /\b(?:v\.|versus)\b|\[?\d{4}\]?\s*(?:eKLR|KLR|EA|AC|UKSC|EWCA|USSC)\b/i],
  ["legislation", /\b(?:Act|Bill|Regulations?|Rules?|Constitution)\b/i],
  ["journal article", /\b(?:Journal|Law Review|Law Quarterly|Review)\b/i],
  ["internet resource", /https?:\/\//i],
  ["report", /\b(?:report|working paper|policy brief)\b/i],
  ["book", /\b(?:Press|Publishers?|University|Ltd\.?|Limited)\b/i]
];

const KALCI_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bet\s+al\.?\b/gi, "and others"],
  [/\binter\s+alia\b/gi, "among other things"],
  [/\bprima\s+facie\b/gi, "at first instance"],
  [/\bper\s+se\b/gi, "in itself"]
];

function canonical(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanKey(value: string): string {
  return canonical(value).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function detectSourceType(text: string): string {
  for (const [name, pattern] of SOURCE_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return "other";
}

function parseComponents(text: string, sourceType: string): SourceComponents {
  const raw = text.trim();
  const components: SourceComponents = {};
  const url = raw.match(/https?:\/\/\S+/i)?.[0];
  if (url) components.url = url.replace(/[),.;]+$/, "");

  const year = raw.match(/\b(?:19|20)\d{2}\b/)?.[0];
  if (year) components.year = year;

  const page = raw.match(/(?:^|,\s*)(?:p\.?\s*)?(\d{1,5})(?:\s*[-–]\s*(\d{1,5}))?\s*\.?$/i)?.[1];
  if (page) components.page = page;

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 0) components.author = parts[0].replace(/\.$/, "");
  if (parts.length > 1) components.title = parts[1].replace(/^["“]|["”]$/g, "").trim();
  if (sourceType === "book" && parts.length >= 3) components.publisher = parts[2].replace(/\.$/, "");
  if (sourceType === "internet resource") components.title = parts[0]?.replace(/\.$/, "");

  return components;
}

function sourceFingerprint(text: string, sourceType: string): string | undefined {
  const c = parseComponents(text, sourceType);
  if (sourceType === "case") {
    const beforeYear = canonical(text).split(/\[?\d{4}\]?/)[0];
    return "case|" + cleanKey(beforeYear).slice(0, 220);
  }
  if (sourceType === "legislation") {
    const match = canonical(text).match(/[a-z][a-z &'’-]{2,120}\b(?:act|bill|regulations?|rules?|constitution)\b(?:\s*\d{4})?/i);
    return "legislation|" + cleanKey(match?.[0] ?? text).slice(0, 180);
  }
  if (c.author && c.title) return `${sourceType}|${cleanKey(c.author)}|${cleanKey(c.title)}`;
  if (c.url) return `${sourceType}|${cleanKey(c.url)}`;
  return `${sourceType}|${cleanKey(text).slice(0, 180)}`;
}

export function splitCompoundFootnote(text: string): string[] {
  return text.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);
}

function tidyText(text: string): string {
  let value = text.trim();
  value = value.replace(/\b(F\.?\s*[A-Z]\.)\b/g, (m) => m.replace(/\./g, "").replace(/\s+/g, ""));
  value = value.replace(/\b([A-Z])\.\s*([A-Z])\.\b/g, "$1$2");
  value = value.replace(/\b(Mr|Mrs|Dr)\./g, "$1");
  for (const [pattern, replacement] of KALCI_REPLACEMENTS) value = value.replace(pattern, replacement);
  value = value.replace(/\s+&\s+/g, " and ");
  value = value.replace(/\s*\/\s*/g, " or ");
  value = value.replace(/\bp\.?\s+(?=\d)/gi, "");
  value = value.replace(/\bpara\.\s*/gi, "para ");
  value = value.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1");
  if (!/[.!?]$/.test(value)) value += ".";
  return value.trim();
}

function analyseSegment(text: string, segmentId: string, registry: Map<string, number>, citationNumber: number): CitationSegment {
  const sourceType = detectSourceType(text);
  const components = parseComponents(text, sourceType);
  const sourceKey = sourceFingerprint(text, sourceType);
  const findings: CitationFinding[] = [];
  const add = (code: string, message: string, rule: string, severity: Severity, suggestion?: string) =>
    findings.push({ code, message, rule, severity, original: text, suggestion });

  if (/\bet\s+al\.?\b/i.test(text))
    add("KALCI-LATIN-001", "Avoid Latinisms; use “and others” where the meaning requires it.", "KALCI Guide, language and style", "error", tidyText(text));
  if (/\b(?:inter\s+alia|prima\s+facie|per\s+se)\b/i.test(text))
    add("KALCI-LATIN-002", "Replace the Latin expression with the plain-English wording required by KALCI.", "KALCI Guide, language and style", "error", tidyText(text));
  if (/\b[A-Z]\.\s*[A-Z]\.\b/.test(text))
    add("KALCI-INIT-001", "Initials should not contain full stops.", "KALCI Guide, abbreviations", "error", tidyText(text));
  if (/\b(?:Mr|Mrs|Dr)\./.test(text))
    add("KALCI-ABBR-001", "Mr, Mrs and Dr do not take full stops.", "KALCI Guide, abbreviations", "error", tidyText(text));
  if (/\bp\.?\s+\d+/i.test(text))
    add("KALCI-PAGE-001", "Do not use “p” before a page number; page numbers appear at the end.", "KALCI Guide, page numbers", "error", tidyText(text));
  if (/\bpara\.\s*\d+/i.test(text))
    add("KALCI-PARA-001", "Use “para” without a full stop.", "KALCI Guide, paragraph numbers", "error", tidyText(text));
  if (/[&]/.test(text))
    add("KALCI-SYM-001", "Use “and” rather than “&” where KALCI calls for words.", "KALCI Guide, symbols and punctuation", "warning", tidyText(text));
  if (/\//.test(text))
    add("KALCI-SYM-002", "Avoid slash constructions where words are appropriate.", "KALCI Guide, symbols and punctuation", "warning", tidyText(text));
  if (/\b[A-Za-z]+ize\b/.test(text))
    add("KALCI-UK-001", "Prefer British -ise spelling where applicable.", "KALCI Guide, British English", "warning");
  if (!/[.!?]$/.test(text.trim()))
    add("KALCI-PUNCT-001", "The citation should end with a full stop.", "KALCI Guide, punctuation", "error", tidyText(text));

  const occurrence: Occurrence = sourceKey ? (registry.has(sourceKey) ? "subsequent" : "first") : "unknown";
  if (sourceKey && !registry.has(sourceKey)) registry.set(sourceKey, citationNumber);

  if (occurrence === "subsequent" && sourceType === "book")
    add("KALCI-BOOK-002", "This appears to be a subsequent book citation. KALCI requires the author's second name in subsequent mention.", "KALCI Guide, books — subsequent mention", "review", "Review the shortened subsequent form for this source.");

  return { id: segmentId, raw: text, sourceType, occurrence, sourceKey, components, findings, correctedText: tidyText(text) };
}

export function analyzeFootnotes(raw: string[]): CitationResult[] {
  const registry = new Map<string, number>();
  return raw.map((text, index) => {
    const number = index + 1;
    const segments = splitCompoundFootnote(text).map((segment, segmentIndex) =>
      analyseSegment(segment, `${number}-${segmentIndex + 1}`, registry, number)
    );
    const first = segments[0];
    const findings = segments.flatMap((segment) => segment.findings);
    return {
      number,
      text,
      sourceType: segments.length > 1 ? "compound" : (first?.sourceType ?? "other"),
      occurrence: segments.length === 1 ? (first?.occurrence ?? "unknown") : "unknown",
      sourceKey: segments.length === 1 ? first?.sourceKey : undefined,
      components: segments.length === 1 ? (first?.components ?? {}) : {},
      findings,
      correctedText: segments.length > 1 ? segments.map((segment) => segment.correctedText).join("; ") : (first?.correctedText ?? ""),
      segments
    };
  }).filter((result) => result.text.trim().length > 0);
}

export const KALCI_RULES = [
  ["Language", "Prefer plain English; avoid Latinisms such as et al., inter alia, prima facie and per se."],
  ["Abbreviations", "Use initials without full stops; Mr, Mrs and Dr also omit full stops."],
  ["Punctuation", "Citations end with a full stop and punctuation follows KALCI placement rules."],
  ["Page and paragraph numbers", "Do not use p before a page number; paragraph numbers use para without a full stop."],
  ["Symbols", "Prefer words such as and or rather than & and slash constructions where appropriate."],
  ["Books", "Author(s), Title, Publisher, year, page. Subsequent mention uses the author's second name."],
  ["Formatting", "Main text: Times New Roman 12, 1.5 line spacing. Footnotes: Calibri Body 10, single spacing."],
  ["English", "Use British English spelling, including -ise where applicable."]
] as const;