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

const SOURCE_SIGNALS: Array<[string, RegExp, number]> = [
  ["KENYAN_CASE", /\beKLR\b|\bKLR\b|\bEA\b/i, 0.90],
  ["AFRICAN_COURT", /\bAfCLR\b|\bAfrican Court on Human and Peoples/i, 0.95],
  ["AFRICAN_COMMISSION", /\bACmHPR\b|\bAfrican Commission/i, 0.95],
  ["EACJ", /\bEACJ\b|East African Court of Justice/i, 0.95],
  ["ECTHR", /\bECtHR\b|European Court of Human Rights/i, 0.95],
  ["ICJ", /\bICJ Reports\b|International Court of Justice/i, 0.95],
  ["IACTHR", /\bIACtHR\b|Inter-American Court of Human Rights/i, 0.95],
  ["IACMHR", /\bIACmHR\b|Inter-American Commission/i, 0.95],
  ["UN_COMMITTEE", /\b(?:CCPR|CRPD|CESCR|CEDAW)\b|UN Committee/i, 0.95],
  ["ARBITRATION", /\bICSID\b|\bARB\/\d+/i, 0.90],
  ["WTO", /\bWT\/DS\d+/i, 0.95],
  ["LEGISLATION", /\b(?:Act|Bill|Regulations?|Rules?|Constitution)\b|\bCap\.?\s*\d+/i, 0.82],
  ["INTERNATIONAL_INSTRUMENT", /\b(?:Charter|Convention|Covenant|Declaration|Resolution|Protocol|Treaty)\b/i, 0.78],
  ["JOURNAL_ARTICLE", /\b(?:Journal|Law Review|Law Quarterly|Review)\b|\(\d{4}\)\s*\d+/i, 0.72],
  ["DISSERTATION", /\b(?:dissertation|thesis)\b/i, 0.90],
  ["CONFERENCE_PAPER", /\bPaper presented at\b|conference.*\bheld on\b/i, 0.90],
  ["HANSARD", /\bHansard\b|National Assembly Hansard/i, 0.95],
  ["PERSONAL_COMMUNICATION", /^(?:Email from|Telephone communication with|Personal communication with|Interview with|WhatsApp communication with)\b/i, 0.95],
  ["GAZETTE_NOTICE", /\bKenya Gazette\b|\bGazette Notice\b/i, 0.95],
  ["YOUTUBE_VIDEO", /\bYouTube\b|\b\d{1,2}:\d{2}\s+to\s+\d{1,2}:\d{2}\b/i, 0.90],
  ["MOTION_PICTURE", /\b(?:motion picture|film)\b|\b(?:19|20)\d{2},\s*\d+:\d{2}:\d{2}/i, 0.90],
  ["PRESS_RELEASE", /\bPress [Rr]elease\b/i, 0.90],
  ["NEWSPAPER", /\b(?:Daily Nation|The Standard|The East African|The Star|Business Daily|New York Times|The Guardian)\b/i, 0.82],
  ["INTERNET_RESOURCE", /https?:\/\/|\bwww\./i, 0.68],
  ["INSTITUTIONAL_AUTHOR", /^(?:Government of|Ministry of|United Nations|World Bank|International Monetary Fund)\b/i, 0.65],
  ["REPORT", /\b(?:report|assessment report|working paper|policy brief)\b/i, 0.62],
  ["SELF_PUBLISHED_ARTICLE", /\b(?:SSRN|ResearchGate|Academia\.edu)\b/i, 0.62],
  ["BOOK", /\b(?:University Press|Press|Publishers?|Books?|Ltd\.?|Limited)\b.*\b(?:19|20)\d{2}\b/i, 0.62]
];

const SOURCE_TYPE_NAMES: Record<string, string> = {
  KENYAN_CASE: "Kenyan case law", AFRICAN_COURT: "African Court",
  AFRICAN_COMMISSION: "African Commission", EACJ: "EACJ", ECTHR: "ECtHR",
  ICJ: "ICJ", IACTHR: "IACtHR", IACMHR: "IACmHR", UN_COMMITTEE: "UN Committee",
  ARBITRATION: "Arbitration", WTO: "WTO", LEGISLATION: "Legislation",
  INTERNATIONAL_INSTRUMENT: "International instrument", JOURNAL_ARTICLE: "Journal article",
  DISSERTATION: "Dissertation", CONFERENCE_PAPER: "Conference paper", HANSARD: "Hansard",
  PERSONAL_COMMUNICATION: "Personal communication", GAZETTE_NOTICE: "Gazette notice",
  YOUTUBE_VIDEO: "YouTube video", MOTION_PICTURE: "Motion picture", PRESS_RELEASE: "Press release",
  NEWSPAPER: "Newspaper", INTERNET_RESOURCE: "Internet resource",
  INSTITUTIONAL_AUTHOR: "Institutional author", REPORT: "Report",
  SELF_PUBLISHED_ARTICLE: "Self-published article", BOOK: "Book"
};

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
  let best = { type: "OTHER", score: 0 };
  for (const [type, pattern, weight] of SOURCE_SIGNALS) {
    if (pattern.test(text) && weight > best.score) best = { type, score: weight };
  }
  return best.type;
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
  if ((sourceType === "BOOK" || sourceType === "REPORT" || sourceType === "INSTITUTIONAL_AUTHOR" || sourceType === "SELF_PUBLISHED_ARTICLE") && parts.length >= 3) components.publisher = parts[2].replace(/\.$/, "");
  if (sourceType === "INTERNET_RESOURCE") components.title = parts[0]?.replace(/\.$/, "");

  return components;
}

function sourceFingerprint(text: string, sourceType: string): string | undefined {
  const c = parseComponents(text, sourceType);
  if (sourceType.includes("CASE") || ["EACJ","AFRICAN_COURT","AFRICAN_COMMISSION","ECTHR","ICJ","IACTHR","IACMHR","UN_COMMITTEE","ARBITRATION","WTO"].includes(sourceType)) {
    const beforeYear = canonical(text).split(/\[?\d{4}\]?/)[0];
    return `${sourceType}|case|${cleanKey(beforeYear).slice(0, 220)}`;
  }
  if (sourceType === "LEGISLATION") {
    const match = canonical(text).match(/[a-z][a-z &'’-]{2,120}\b(?:act|bill|regulations?|rules?|constitution)\b(?:\s*\d{4})?/i);
    return "LEGISLATION|" + cleanKey(match?.[0] ?? text).slice(0, 180);
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
  const title = components.title ? cleanKey(components.title) : "";
  const year = components.year ? cleanKey(components.year) : "";
  const surname = components.author ? cleanKey(components.author.split(/\s+/).filter(Boolean).at(-1) ?? components.author) : "";
  const matchKeys = [
    sourceKey,
    title ? `${sourceType}|title|${title}` : undefined,
    title && year ? `${sourceType}|title-year|${title}|${year}` : undefined,
    surname && title ? `${sourceType}|surname-title|${surname}|${title}` : undefined,
    surname && title && year ? `${sourceType}|surname-title-year|${surname}|${title}|${year}` : undefined
  ].filter((key): key is string => Boolean(key));
  const matchedKey = matchKeys.find((key) => registry.has(key));
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

  const occurrence: Occurrence = matchedKey ? "subsequent" : matchKeys.length ? "first" : "unknown";
  if (!matchedKey && matchKeys.length) {
    for (const key of matchKeys) registry.set(key, citationNumber);
  }

  if (occurrence === "subsequent" && sourceType === "BOOK")
    add("KALCI-BOOK-002", "This appears to be a subsequent book citation. KALCI requires the author's second name in subsequent mention.", "KALCI Guide, books — subsequent mention", "review", "Review the shortened subsequent form for this source.");

  const correctedText = tidyText(text);

  const requiredByType: Record<string, string[]> = {
    BOOK: ["author", "title", "publisher", "year"],
    JOURNAL_ARTICLE: ["author", "title", "publisher", "year"],
    NEWSPAPER: ["author", "title", "publisher", "date"],
    DISSERTATION: ["author", "title", "year"],
    INSTITUTIONAL_AUTHOR: ["author", "title"],
    REPORT: ["author", "title"],
    PERSONAL_COMMUNICATION: ["date"],
    GAZETTE_NOTICE: ["date"]
  };

  for (const field of requiredByType[sourceType] ?? []) {
    const found = Boolean(components[field as keyof SourceComponents]);
    if (!found) {
      findings.push({
        code: "KALCI-STRUCTURE-001",
        message: `The ${SOURCE_TYPE_NAMES[sourceType] ?? sourceType} citation may be missing a ${field.replace("_", " ")}.`,
        rule: `KALCI template — ${SOURCE_TYPE_NAMES[sourceType] ?? sourceType}`,
        severity: "review",
        original: text,
        suggestion: "Confirm the source-specific template before applying a structural correction."
      });
    }
  }

  if (sourceType === "JOURNAL_ARTICLE" && /^[A-Z]{2,}(?:\s+[A-Z]{2,})*$/.test(components.publisher ?? "")) {
    findings.push({
      code: "KALCI-JOURNAL-001",
      message: "Journal names should not be abbreviated.",
      rule: "KALCI PDF, page 4 — Journal articles",
      severity: "error",
      original: text
    });
  }

  if (sourceType === "LEGISLATION" && occurrence === "first" && !/\(No\.?\s*\d+\s+of\s+\d{4}\)|\(\d{4}\)/i.test(text)) {
    findings.push({
      code: "KALCI-LEGISLATION-001",
      message: "First legislation citations should include the required year/number parenthetical.",
      rule: "KALCI PDF, page 5 — Legislation",
      severity: "review",
      original: text
    });
  }

  if (sourceType === "LEGISLATION" && occurrence === "subsequent" && /\(No\.?\s*\d+\s+of\s+\d{4}\)|\(\d{4}\)/i.test(text)) {
    findings.push({
      code: "KALCI-LEGISLATION-002",
      message: "Subsequent legislation citations normally drop the bracketed number/year.",
      rule: "KALCI PDF, page 5 — Legislation",
      severity: "error",
      original: text
    });
  }

  const generalChecks: Array<[string, RegExp, string, string, Severity]> = [
    ["KALCI-PLURAL-001", /\b[A-Z]{2,}['’]s\b/, "Do not use apostrophes in abbreviated plurals.", "KALCI PDF, page 2 — General guidelines", "error"],
    ["KALCI-DECADE-001", /\b(?:19|20)\d{2}['’]s\b/, "Do not use apostrophes when writing decades.", "KALCI PDF, page 2 — General guidelines", "error"],
    ["KALCI-ROMAN-001", /\b(?:[IVXLCDM]{4,})\b/, "Avoid Roman numerals in the citation text.", "KALCI PDF, page 3 — General guidelines", "warning"],
    ["KALCI-COMMA-001", /\b\d{4,}\b/, "Figures with more than three digits should use commas.", "KALCI PDF, page 3 — General guidelines", "warning"],
    ["KALCI-SUPERSCRIPT-001", /\b\d+(?:st|nd|rd|th)\b/i, "Avoid superscript-style ordinal forms; write ordinals in words.", "KALCI PDF, page 3 — General guidelines", "warning"]
  ];

  for (const [code, pattern, message, rule, severity] of generalChecks) {
    if (pattern.test(text)) findings.push({ code, message, rule, severity, original: text });
  }

  return { id: segmentId, raw: text, sourceType, occurrence, sourceKey, components, findings, correctedText };
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