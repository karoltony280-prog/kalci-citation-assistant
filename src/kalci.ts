export type SourceComponents = {
  author?: string;
  title?: string;
  publisher?: string;
  year?: string;
  page?: string;
  url?: string;
  date?: string;
  section?: string;
  article?: string;
  paragraph?: string;
  caseNumber?: string;
  reporter?: string;
  court?: string;
  volume?: string;
  journal?: string;
  status?: string;
  institution?: string;
  communicationNumber?: string;
  series?: string;
  identifier?: string;
};

export type Severity = "error" | "warning" | "review";
export type Occurrence = "first" | "subsequent" | "unknown";

export type TextEdit = {
  start: number;
  end: number;
  replacement: string;
  ruleCode: string;
  safe: boolean;
};

export type KalciTemplateDefinition = {
  sourceType: string;
  citationStage: "first" | "subsequent";
  templateText: string;
};

export type CitationFinding = {
  code: string;
  message: string;
  rule: string;
  severity: Severity;
  original: string;
  suggestion?: string;
  safeToApply?: boolean;
};

export type CitationSegment = {
  id: string;
  raw: string;
  sourceType: string;
  sourceConfidence: number;
  occurrence: Occurrence;
  sourceKey?: string;
  components: SourceComponents;
  findings: CitationFinding[];
  correctedText: string;
  edits: TextEdit[];
  correctionReason?: string;
  correctionStage?: "first" | "subsequent";
  templateText?: string;
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
  ["FOREIGN_CASE", /\b[^,;]{2,120}\s+v(?:s|ersus)?\.?\s+[^,;]{2,120}\b/i, 0.55],
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
  ["CHAPTER_IN_BOOK", /\bin\s+[^,]+\([^)]*eds?\)/i, 0.74],
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
  KENYAN_CASE: "Kenyan case law", FOREIGN_CASE: "Foreign case law", CHAPTER_IN_BOOK: "Chapter in book", AFRICAN_COURT: "African Court",
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

const BOOK_LIKE = new Set(["BOOK","DISSERTATION","INTERNET_RESOURCE"]);

function extractPage(text: string): string | undefined {
  const match = text.match(/(?:^|,\s*)(?:p\.?\s*)?(\d{1,5})(?:\s*[-–]\s*(\d{1,5}))?\s*\.?$/i);
  return match ? (match[2] ? match[1] + "–" + match[2] : match[1]) : undefined;
}

function removeFinalStop(text: string): string {
  return text.trim().replace(/[.!?]$/, "");
}

function surnameOf(author?: string): string | undefined {
  if (!author) return undefined;
  const cleaned = author.trim().replace(/[.]+/g, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.at(-1);
}

function splitByComma(text: string): string[] {
  return text.split(",").map((part) => part.trim()).filter(Boolean);
}

function parseBookLike(text: string): SourceComponents {
  const parts = splitByComma(text.replace(/[.!?]$/, ""));
  const components: SourceComponents = {};
  components.author = parts[0];
  components.title = parts[1];
  const yearIndex = parts.findIndex((part) => /^(?:19|20)\d{2}$/.test(part));
  if (yearIndex >= 0) components.year = parts[yearIndex];
  if (yearIndex > 1) components.publisher = parts[yearIndex - 1];
  components.page = extractPage(text);
  return components;
}

function parseLegislation(text: string): SourceComponents {
  const cleaned = text.replace(/[.!?]$/, "").trim();
  const components: SourceComponents = {};
  const parenthetical = cleaned.match(/\((?:No\.?\s*\d+\s+of\s+\d{4}|\d{4})\)/i)?.[0];
  const head = cleaned.split(/\s*,\s*(?:Section|Article)\b/i)[0];
  components.title = head.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (parenthetical) components.year = parenthetical.replace(/[()]/g, "").trim().match(/\d{4}/)?.[0];
  const no = parenthetical?.match(/No\.?\s*(\d+)\s+of\s+(\d{4})/i);
  if (no) components.identifier = "No " + no[1] + " of " + no[2];
  const ref = cleaned.match(/\b(Section|Article)\s+([\w.-]+(?:\s*[-–]\s*[\w.-]+)?)/i);
  if (ref) {
    const key = ref[1].toLowerCase() === "article" ? "article" : "section";
    components[key] = ref[2];
  }
  return components;
}

function formatSupportedCitation(text: string, sourceType: string, occurrence: Occurrence): { text: string; reason: string; safe: boolean; stage?: "first"|"subsequent" } | null {
  if (occurrence === "unknown") return null;

  if (sourceType === "BOOK") {
    const c = parseBookLike(text);
    if (!c.author || !c.title || !c.year || !c.publisher) return null;
    const page = c.page ? ", " + c.page : "";
    if (occurrence === "subsequent") {
      const surname = surnameOf(c.author);
      if (!surname) return null;
      return { text: surname + ", " + c.title + page + ".", reason: "This source has already appeared. KALCI's subsequent book form uses the author's second name, title and page.", safe: true, stage: "subsequent" };
    }
    return { text: c.author + ", " + c.title + ", " + c.publisher + ", " + c.year + page + ".", reason: "This is the first occurrence of the book source, so KALCI's full book form is used.", safe: true, stage: "first" };
  }

  if (sourceType === "DISSERTATION") {
    const c = parseBookLike(text);
    if (!c.author || !c.title || !c.year) return null;
    const page = c.page ? ", " + c.page : "";
    if (occurrence === "subsequent") {
      const surname = surnameOf(c.author);
      if (!surname) return null;
      return { text: surname + ", " + c.title + page + ".", reason: "This is a subsequent dissertation/thesis citation; KALCI shortens it to the author's second name, title and page.", safe: true, stage: "subsequent" };
    }
    return null;
  }

  if (sourceType === "LEGISLATION") {
    const c = parseLegislation(text);
    if (!c.title) return null;
    const ref = c.section ? "Section " + c.section : c.article ? "Article " + c.article : "";
    const refSuffix = ref ? ", " + ref : "";
    const no = c.identifier ? " (" + c.identifier + ")" : c.year && /constitution/i.test(c.title) ? " (" + c.year + ")" : "";
    if (occurrence === "first") {
      if (!no) return null;
      return { text: c.title + no + refSuffix + ".", reason: "This is the first legislation citation. KALCI retains the Act number/year parenthetical and the section or Article reference.", safe: true, stage: "first" };
    }
    return { text: c.title + refSuffix + ".", reason: "This legislation has already appeared. KALCI's subsequent form drops the bracketed number/year.", safe: true, stage: "subsequent" };
  }

  const caseTypes = new Set(["KENYAN_CASE","FOREIGN_CASE","EACJ","AFRICAN_COURT","AFRICAN_COMMISSION","ECTHR","ICJ","IACTHR","IACMHR","UN_COMMITTEE"]);
  if (caseTypes.has(sourceType)) {
    const c = parseCaseComponents(text);
    if (!c.title) return null;

    if (sourceType === "FOREIGN_CASE") {
      if (occurrence === "first") {
        const withoutPara = text.trim().replace(/\s*,?\s*para\s+[A-Za-z0-9.-]+\s*\.?\s*$/i, "");
        if (withoutPara && c.title && (c.reporter || /\[\d{4}\]|\(\d{4}\)/.test(withoutPara))) {
          return { text: removeFinalStop(withoutPara) + ".", reason: "This is the first foreign case citation. KALCI preserves the case name and reporter citation rather than inventing case metadata.", safe: true, stage: "first" };
        }
      }
      if (occurrence === "subsequent") {
        return { text: c.title + ".", reason: "This foreign case has already appeared. KALCI's subsequent form uses the case name.", safe: true, stage: "subsequent" };
      }
      return null;
    }

    if (sourceType === "KENYAN_CASE") {
      if (occurrence === "first" && c.caseNumber && c.court && c.year && c.reporter) {
        const para = c.paragraph ? ", para " + c.paragraph : "";
        return {
          text: c.title + ", " + c.caseNumber + ", " + c.court + " (" + c.year + ") " + c.reporter + para + ".",
          reason: "The case has enough structured metadata for KALCI's first Kenyan case form: case name, case number, court, year, reporter and paragraph where supplied.",
          safe: true,
          stage: "first"
        };
      }
      if (occurrence === "subsequent" && c.court && c.year) {
        const para = c.paragraph ? ", para " + c.paragraph : "";
        return {
          text: c.title + ", " + c.court + " (" + c.year + ")" + para + ".",
          reason: "This Kenyan case has already appeared. KALCI's subsequent form drops the full case number and reporter.",
          safe: true,
          stage: "subsequent"
        };
      }
      return null;
    }

    if (occurrence === "first" && c.status && c.year) {
      if (sourceType === "EACJ" && c.reporter && c.paragraph) {
        return { text: c.title + " (" + c.status + "), " + (c.caseNumber ?? "") + ", EACJ (" + c.year + "), para " + c.paragraph + ".", reason: "The EACJ source contains the stage, year and paragraph needed for the KALCI EACJ template.", safe: Boolean(c.caseNumber), stage: "first" };
      }
      if (sourceType === "AFRICAN_COURT" && c.reporter && c.paragraph) {
        return { text: c.title + " (" + c.status + "), " + c.reporter + " (" + c.year + "), para " + c.paragraph + ".", reason: "The African Court citation has the case stage, reporter, year and paragraph required by KALCI.", safe: true, stage: "first" };
      }
      if (sourceType === "AFRICAN_COMMISSION" && c.caseNumber && c.paragraph) {
        return { text: c.title + " (" + c.status + "), " + c.caseNumber + ", ACmHPR (" + c.year + "), para " + c.paragraph + ".", reason: "The African Commission citation has the communication number, decision stage, year and paragraph required by KALCI.", safe: true, stage: "first" };
      }
      if (sourceType === "ECTHR" && c.caseNumber && c.paragraph) {
        return { text: c.title + " (" + c.status + "), " + c.caseNumber + ", ECtHR (" + c.year + "), para " + c.paragraph + ".", reason: "The ECtHR citation has the application number, stage, year and paragraph required by KALCI.", safe: true, stage: "first" };
      }
      if (sourceType === "IACMHR" && c.caseNumber && c.paragraph) {
        return { text: c.title + " (" + c.status + "), " + c.caseNumber + ", IACmHR (" + c.year + "), para " + c.paragraph + ".", reason: "The Inter-American Commission citation has the petition number, stage, year and paragraph required by KALCI.", safe: true, stage: "first" };
      }
      if (sourceType === "IACTHR" && c.reporter && c.paragraph) {
        return { text: c.title + " (" + c.status + "), " + c.reporter + " (" + c.year + "), para " + c.paragraph + ".", reason: "The Inter-American Court citation has its Series C/report identifier, year and paragraph required by KALCI.", safe: true, stage: "first" };
      }
      if (sourceType === "UN_COMMITTEE" && c.caseNumber && c.paragraph) {
        return { text: c.title + " (" + c.status + "), " + c.caseNumber + ", " + (c.reporter ?? "") + " (" + c.year + "), " + c.paragraph + ".", reason: "The UN Committee citation has its communication number, committee, year and paragraph/page reference.", safe: Boolean(c.reporter), stage: "first" };
      }
    }
    return null;
  }

  if (BOOK_LIKE.has(sourceType) && occurrence === "subsequent") {
    const c = parseBookLike(text);
    const surname = surnameOf(c.author);
    if (surname && c.title) {
      return { text: surname + ", " + c.title + (c.page ? ", " + c.page : "") + ".", reason: "The source recurs later in the document, so a shortened author/title form is safer than repeating full publication details.", safe: true, stage: "subsequent" };
    }
  }

  return null;
}

function buildSafeEdits(original: string, corrected: string, ruleCode = "KALCI-FORMAT-001"): TextEdit[] {
  if (original === corrected) return [];
  return [{
    start: 0,
    end: original.length,
    replacement: corrected,
    ruleCode,
    safe: true
  }];
}

function buildNormalisationEdits(text: string): TextEdit[] {
  const edits: TextEdit[] = [];
  const pushMatches = (pattern: RegExp, replacement: string | ((...args: string[]) => string), ruleCode: string) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    const re = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      const rendered = typeof replacement === "function"
        ? replacement(...([match[0], ...match.slice(1)] as string[]))
        : replacement;
      edits.push({ start, end: start + match[0].length, replacement: rendered, ruleCode, safe: true });
    }
  };
  pushMatches(/\bet\s+al\.?\b/gi, "and others", "KALCI-LATIN-001");
  pushMatches(/\binter\s+alia\b/gi, "among other things", "KALCI-LATIN-002");
  pushMatches(/\bprima\s+facie\b/gi, "at first instance", "KALCI-LATIN-002");
  pushMatches(/\bper\s+se\b/gi, "in itself", "KALCI-LATIN-002");
  pushMatches(/\b([A-Z])\.\s*([A-Z])\./g, (_full, a, b) => a + b, "KALCI-INIT-001");
  pushMatches(/\b(Mr|Mrs|Dr)\./g, (_full, title) => title, "KALCI-ABBR-001");
  pushMatches(/\s+&\s+/g, " and ", "KALCI-SYM-001");
  pushMatches(/\s*\/\s*/g, " or ", "KALCI-SYM-002");
  pushMatches(/\bp\.?\s+(?=\d)/gi, "", "KALCI-PAGE-001");
  pushMatches(/\bpara\.\s*/gi, "para ", "KALCI-PARA-001");
  return edits.sort((a, b) => b.start - a.start);
}

export function applyTextEdits(text: string, edits: TextEdit[]): string {
  return [...edits].sort((a, b) => b.start - a.start).reduce(
    (value, edit) => value.slice(0, edit.start) + edit.replacement + value.slice(edit.end),
    text
  );
}

export function formatCitation(
  text: string,
  sourceType: string,
  occurrence: Occurrence
): { correctedText: string; edits: TextEdit[]; reason?: string; stage?: "first"|"subsequent"; safe: boolean } {
  const structural = formatSupportedCitation(text, sourceType, occurrence);
  if (structural) {
    return {
      correctedText: structural.text,
      edits: buildSafeEdits(text, structural.text, "KALCI-FORMAT-" + sourceType),
      reason: structural.reason,
      stage: structural.stage,
      safe: structural.safe
    };
  }
  const normalized = applyTextEdits(text, buildNormalisationEdits(text));
  let corrected = normalized.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  if (corrected && !/[.!?]$/.test(corrected)) corrected += ".";
  const edits = buildSafeEdits(text, corrected);
  return {
    correctedText: corrected,
    edits,
    reason: edits.length ? "Only deterministic KALCI wording, abbreviation, punctuation and spacing corrections were found; source structure was left untouched." : undefined,
    safe: true
  };
}

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

function detectSourceType(text: string): { type: string; confidence: number } {
  let best = { type: "OTHER", score: 0 };
  for (const [type, pattern, weight] of SOURCE_SIGNALS) {
    pattern.lastIndex = 0;
    if (pattern.test(text) && weight > best.score) best = { type, score: weight };
  }
  return { type: best.type, confidence: best.score };
}
function parseGenericParts(raw: string): string[] {
  return raw
    .replace(/[.!?]$/, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDate(raw: string): string | undefined {
  const monthDate = raw.match(/\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i)?.[0];
  if (monthDate) return monthDate;
  const iso = raw.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  return iso;
}

function parseCaseComponents(raw: string): SourceComponents {
  const components: SourceComponents = {};
  const clean = raw.replace(/[.!?]$/, "").trim();

  const para = clean.match(/\bpara\s+([A-Za-z0-9.-]+)/i);
  if (para) components.paragraph = para[1];

  const reporter = clean.match(/\b(?:eKLR|KLR|EA|AfCLR|ACmHPR|EACJ|ECtHR|ICJ Reports|IACtHR|IACmHR)\b/i);
  if (reporter) components.reporter = reporter[0];

  const year = clean.match(/\b(?:19|20)\d{2}\b/)?.[0];
  if (year) components.year = year;

  const versus = clean.match(/^(.+?\s+v(?:s|versus)?\.?\s+.+?)(?=,\s+(?:Civil|Constitutional|Petition|Appeal|Application|Reference|Criminal)\b|,\s+(?:decision|ruling|judgment|order)\b|,\s+\d+\s+(?:AfCLR|EACJ)\b|,\s+\w+\s+\(\d{4}\))/i);
  if (versus) components.title = versus[1].trim();

  if (!components.title) {
    const comma = clean.indexOf(",");
    components.title = comma > 0 ? clean.slice(0, comma).trim() : clean.split(/\s+(?:\(|,)\s*/)[0].trim();
  }

  const caseNumber = clean.match(/\b(?:Civil|Constitutional|Petition|Appeal|Application|Reference|Criminal)\s+(?:Case\s+|Appeal\s+|Petition\s+|Application\s+|Reference\s+)?\d+\s+of\s+\d{4}\b/i)
    ?? clean.match(/\b\d+\s+of\s+\d{4}\b(?=\s*,|\s+\()/i);
  if (caseNumber) components.caseNumber = caseNumber[0];

  const stage = clean.match(/\(([^()]{3,80})\)/)?.[1];
  if (stage && /(merits|jurisdiction|admissibility|ruling|judgment|decision|award|order)/i.test(stage)) components.status = stage;

  const court = clean.match(/,\s*([^,()]+?)\s*\((?:19|20)\d{2}\)\s*(?:eKLR|KLR|EA)\b/i);
  if (court) components.court = court[1].trim();

  if (/^case of /i.test(components.title ?? "")) components.title = (components.title ?? "").replace(/^case of\s+/i, "");

  return components;
}

function parseJournalComponents(raw: string): SourceComponents {
  const components: SourceComponents = {};
  const parts = parseGenericParts(raw);
  components.author = parts[0];
  components.title = parts[1];
  const volumeYear = raw.match(/\b(\d+)\s+([^,]+)\s+((?:19|20)\d{2})\s+([0-9]+(?:[-–][0-9]+)?)\b/);
  if (volumeYear) {
    components.volume = volumeYear[1];
    components.journal = volumeYear[2].trim();
    components.year = volumeYear[3];
    components.page = volumeYear[4];
  } else {
    components.journal = parts.find((part) => /\b(?:Journal|Review|Quarterly)\b/i.test(part));
    components.year = raw.match(/\b(?:19|20)\d{2}\b/)?.[0];
    components.page = extractPage(raw);
  }
  return components;
}

function parseNewspaperComponents(raw: string): SourceComponents {
  const parts = parseGenericParts(raw);
  return {
    author: parts[0],
    title: parts[1],
    publisher: parts[2],
    date: parseDate(raw) ?? raw.match(/\b(?:19|20)\d{2}\b/)?.[0]
  };
}

function parseReportComponents(raw: string): SourceComponents {
  const parts = parseGenericParts(raw);
  const year = raw.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const yearIndex = year ? parts.findIndex((part) => part === year) : -1;
  return {
    author: parts[0],
    title: parts[1],
    publisher: yearIndex > 1 ? parts[yearIndex - 1] : undefined,
    year,
    page: extractPage(raw)
  };
}

function parseComponents(text: string, sourceType: string): SourceComponents {
  const raw = text.trim();
  const url = raw.match(/https?:\/\/\S+/i)?.[0];

  if (["KENYAN_CASE","FOREIGN_CASE","EACJ","AFRICAN_COURT","AFRICAN_COMMISSION","ECTHR","ICJ","IACTHR","IACMHR","UN_COMMITTEE","ARBITRATION","WTO"].includes(sourceType)) {
    return parseCaseComponents(raw);
  }
  if (sourceType === "LEGISLATION") return parseLegislation(raw);
  if (sourceType === "JOURNAL_ARTICLE") return parseJournalComponents(raw);
  if (sourceType === "NEWSPAPER") return parseNewspaperComponents(raw);
  if (sourceType === "REPORT" || sourceType === "INSTITUTIONAL_AUTHOR") return parseReportComponents(raw);
  if (sourceType === "BOOK" || sourceType === "DISSERTATION" || sourceType === "SELF_PUBLISHED_ARTICLE") return parseBookLike(raw);

  const parts = parseGenericParts(raw);
  const components: SourceComponents = {};
  if (parts[0]) components.author = parts[0].replace(/\.$/, "");
  if (parts[1]) components.title = parts[1].replace(/^["“]|["”]$/g, "").trim();
  const year = raw.match(/\b(?:19|20)\d{2}\b/)?.[0];
  if (year) components.year = year;
  components.date = parseDate(raw);
  components.page = extractPage(raw);
  if (url) components.url = url.replace(/[),.;]+$/, "");
  if (sourceType === "INTERNET_RESOURCE") {
    components.url = url?.replace(/[),.;]+$/, "");
    components.title = parts[1] ?? parts[0]?.replace(/[.!?]$/, "");
  }
  if (sourceType === "PERSONAL_COMMUNICATION") components.date = parseDate(raw);
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

function analyseSegment(
  text: string,
  segmentId: string,
  registry: Map<string, number>,
  citationNumber: number,
  templates: KalciTemplateDefinition[]
): CitationSegment {
  const detected = detectSourceType(text);
  const sourceType = detected.type;
  const sourceConfidence = detected.confidence;
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

  if (sourceType === "OTHER" || sourceConfidence < 0.60) {
    findings.push({
      code: "KALCI-CLASS-001",
      message: sourceType === "OTHER"
        ? "The source type could not be identified with sufficient confidence."
        : "The source type is provisionally classified but should be confirmed before a structural correction.",
      rule: "KALCI source taxonomy and classifier",
      severity: "review",
      original: text,
      suggestion: "Confirm the source category; structural formatting is intentionally conservative for low-confidence classifications.",
      safeToApply: false
    });
  }
  if (!matchedKey && matchKeys.length) {
    for (const key of matchKeys) registry.set(key, citationNumber);
  }

  const correction = formatCitation(text, sourceType, occurrence);

  if (occurrence === "subsequent" && sourceType === "BOOK") {
    add(
      "KALCI-BOOK-002",
      "This appears to be a subsequent book citation. KALCI requires the author's second name in subsequent mention.",
      "KALCI Guide, books — subsequent mention",
      "review",
      correction.correctedText
    );
  }

  const templateText = templates.find(
    (template) => template.sourceType === sourceType && template.citationStage === occurrence
  )?.templateText;

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
        rule: `KALCI template — ${SOURCE_TYPE_NAMES[sourceType] ?? sourceType}${templateText ? " · " + templateText : ""}`,
        severity: "review",
        original: text,
        suggestion: "Confirm the source-specific template before applying a structural correction.",
        safeToApply: false
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

  for (const finding of findings) {
    if (!finding.suggestion && correction.correctedText !== text) finding.suggestion = correction.correctedText;
    if (correction.edits.length && finding.suggestion === correction.correctedText) finding.safeToApply = correction.safe;
  }

  return {
    id: segmentId,
    raw: text,
    sourceType,
    sourceConfidence,
    occurrence,
    sourceKey,
    components,
    findings,
    correctedText: correction.correctedText,
    edits: correction.edits,
    correctionReason: correction.reason,
    correctionStage: correction.stage,
    templateText
  };
}

export function analyzeFootnotes(raw: string[], templates: KalciTemplateDefinition[] = []): CitationResult[] {
  const registry = new Map<string, number>();
  return raw.map((text, index) => {
    const number = index + 1;
    const segments = splitCompoundFootnote(text).map((segment, segmentIndex) =>
      analyseSegment(segment, `${number}-${segmentIndex + 1}`, registry, number, templates)
    );
    const first = segments[0];
    const findings = segments.flatMap((segment) => segment.findings);
    return {
      number,
      text,
      sourceType: segments.length > 1 ? "compound" : (first?.sourceType ?? "other"),
      sourceConfidence: segments.length === 1 ? (first?.sourceConfidence ?? 0) : 0,
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