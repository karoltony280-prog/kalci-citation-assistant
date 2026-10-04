import { unzipSync } from "fflate";

export type ImportedFootnote = {
  footnoteNumber: number;
  raw: string;
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function xmlText(node: Element): string {
  return Array.from(node.getElementsByTagNameNS(WORD_NS, "t"))
    .map((textNode) => textNode.textContent ?? "")
    .join("");
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

export async function extractDocxFootnotesFromFile(file: File): Promise<ImportedFootnote[]> {
  return extractDocxFootnotes(new Uint8Array(await file.arrayBuffer()));
}
