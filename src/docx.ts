import { unzipSync } from "fflate";

export type ImportedFootnote = {
  footnoteNumber: number;
  raw: string;
};

export type DocxFormatAudit = {
  main: {
    font?: string;
    sizePt?: number;
    lineSpacing?: string;
  };
  footnotes: {
    font?: string;
    sizePt?: number;
    lineSpacing?: string;
  };
  marginsCm?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  directFormattingOnly: boolean;
  findings: string[];
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function xmlText(node: Element): string {
  return Array.from(node.getElementsByTagNameNS(WORD_NS, "t"))
    .map((textNode) => textNode.textContent ?? "")
    .join("");
}

function mostCommon(values: Array<string | number>): string | number | undefined {
  if (!values.length) return undefined;
  const counts = new Map<string | number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function readFormatting(root: Document | Element): { font?: string; sizePt?: number; lineSpacing?: string } {
  const fonts = Array.from(root.getElementsByTagNameNS(WORD_NS, "rFonts"))
    .map((node) => node.getAttributeNS(WORD_NS, "ascii") || node.getAttributeNS(WORD_NS, "hAnsi"))
    .filter((value): value is string => Boolean(value));
  const sizes = Array.from(root.getElementsByTagNameNS(WORD_NS, "sz"))
    .map((node) => Number(node.getAttributeNS(WORD_NS, "val")))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => value / 2);
  const spacing = Array.from(root.getElementsByTagNameNS(WORD_NS, "spacing"))
    .map((node) => Number(node.getAttributeNS(WORD_NS, "line")))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => value === 360 ? "1.5 lines" : `${value} twips`);

  return {
    font: mostCommon(fonts) as string | undefined,
    sizePt: mostCommon(sizes) as number | undefined,
    lineSpacing: mostCommon(spacing) as string | undefined
  };
}

function readMargins(documentXml: Document): DocxFormatAudit["marginsCm"] {
  const pageMargins = documentXml.getElementsByTagNameNS(WORD_NS, "pgMar")[0];
  if (!pageMargins) return undefined;
  const twipsToCm = (value: string | null) => {
    const twips = Number(value);
    return Number.isFinite(twips) ? Number((twips / 1440 * 2.54).toFixed(2)) : undefined;
  };
  return {
    top: twipsToCm(pageMargins.getAttributeNS(WORD_NS, "top")),
    right: twipsToCm(pageMargins.getAttributeNS(WORD_NS, "right")),
    bottom: twipsToCm(pageMargins.getAttributeNS(WORD_NS, "bottom")),
    left: twipsToCm(pageMargins.getAttributeNS(WORD_NS, "left"))
  };
}

export function inspectDocxFormatting(bytes: Uint8Array): DocxFormatAudit {
  const files = unzipSync(bytes);
  const documentBytes = files["word/document.xml"];
  const footnotesBytes = files["word/footnotes.xml"];
  if (!documentBytes) throw new Error("This Word document does not contain a document body.");
  if (!footnotesBytes) throw new Error("This Word document does not contain a footnotes part.");

  const parser = new DOMParser();
  const documentXml = parser.parseFromString(new TextDecoder("utf-8").decode(documentBytes), "application/xml");
  const footnotesXml = parser.parseFromString(new TextDecoder("utf-8").decode(footnotesBytes), "application/xml");
  if (documentXml.querySelector("parsererror") || footnotesXml.querySelector("parsererror")) {
    throw new Error("The Word formatting data could not be parsed.");
  }

  const main = readFormatting(documentXml);
  const footnotes = readFormatting(footnotesXml);
  const marginsCm = readMargins(documentXml);
  const findings: string[] = [];

  if (main.font && main.font.toLowerCase() !== "times new roman") {
    findings.push(`Main-text direct formatting uses ${main.font}, not Times New Roman.`);
  } else if (!main.font) {
    findings.push("Main-text font is inherited or not directly specified; KALCI cannot confirm Times New Roman from direct formatting alone.");
  }

  if (main.sizePt && main.sizePt !== 12) {
    findings.push(`Main-text direct formatting is ${main.sizePt} pt, not 12 pt.`);
  }

  if (footnotes.font && !/calibri/i.test(footnotes.font)) {
    findings.push(`Footnote direct formatting uses ${footnotes.font}, not Calibri.`);
  } else if (!footnotes.font) {
    findings.push("Footnote font is inherited or not directly specified; KALCI cannot confirm Calibri from direct formatting alone.");
  }

  if (footnotes.sizePt && footnotes.sizePt !== 10) {
    findings.push(`Footnote direct formatting is ${footnotes.sizePt} pt, not 10 pt.`);
  }

  if (main.lineSpacing && main.lineSpacing !== "1.5 lines") {
    findings.push(`Main-text direct paragraph spacing is ${main.lineSpacing}; KALCI expects 1.5 line spacing.`);
  }

  if (footnotes.lineSpacing && footnotes.lineSpacing === "1.5 lines") {
    findings.push("Footnote direct paragraph spacing is 1.5 lines; KALCI expects single spacing.");
  }

  const marginValues = marginsCm ? Object.values(marginsCm).filter((value): value is number => typeof value === "number") : [];
  if (!marginsCm || marginValues.length !== 4) {
    findings.push("Page margins could not be confirmed from the document section settings.");
  } else if (marginValues.some((value) => Math.abs(value - 2) > 0.15)) {
    findings.push(`Page margins are approximately ${marginValues.join(" / ")} cm; KALCI expects 2 cm.`);
  }

  return { main, footnotes, marginsCm, directFormattingOnly: true, findings };
}

export function extractDocxFootnotes(bytes: Uint8Array): ImportedFootnote[] {
  const files = unzipSync(bytes);
  const footnotesXml = files["word/footnotes.xml"];
  if (!footnotesXml) throw new Error("This Word document does not contain a footnotes part.");

  const xml = new TextDecoder("utf-8").decode(footnotesXml);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error("The Word footnotes part could not be parsed.");

  return Array.from(document.getElementsByTagNameNS(WORD_NS, "footnote"))
    .map((node) => ({
      footnoteNumber: Number(node.getAttributeNS(WORD_NS, "id") ?? node.getAttribute("w:id")),
      raw: xmlText(node).replace(/\s+/g, " ").trim()
    }))
    .filter((item) => Number.isFinite(item.footnoteNumber) && item.footnoteNumber >= 0 && item.raw.length > 0)
    .sort((a, b) => a.footnoteNumber - b.footnoteNumber);
}

export async function inspectDocxFormattingFromFile(file: File): Promise<DocxFormatAudit> {
  return inspectDocxFormatting(new Uint8Array(await file.arrayBuffer()));
}

export async function extractDocxFootnotesFromFile(file: File): Promise<ImportedFootnote[]> {
  return extractDocxFootnotes(new Uint8Array(await file.arrayBuffer()));
}
