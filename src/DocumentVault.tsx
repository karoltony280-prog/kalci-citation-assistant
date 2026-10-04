import { useEffect, useMemo, useState } from "react";
import { loadDocument, listMyDocuments, saveDocument, signOut, type PersistedDocument, type PersistedDocumentData } from "./supabase";
import type { CitationResult } from "./kalci";

type Props = {
  documentId: string | null;
  documentName: string | null;
  value: string;
  results: CitationResult[];
  onDocumentIdChange: (id: string | null) => void;
  onDocumentNameChange: (name: string | null) => void;
  onLoad: (document: PersistedDocumentData) => void;
};

function validationStatus(result: CitationResult): "valid"|"error"|"warning"|"review" {
  if (result.findings.some((f) => f.severity === "error")) return "error";
  if (result.findings.some((f) => f.severity === "warning")) return "warning";
  if (result.findings.some((f) => f.severity === "review")) return "review";
  return "valid";
}

function buildPayload(value: string, results: CitationResult[]) {
  const lines = value.split(/\r?\n/);
  const footnotes = results.map((result, index) => ({
    number: result.number || index + 1,
    rawText: lines[index] ?? result.text,
    validationStatus: validationStatus(result)
  }));

  const sources = new Map<string, {
    canonicalKey: string;
    canonicalName: string;
    sourceType: string;
    author?: string;
    title?: string;
    year?: string;
    publisher?: string;
  }>();
  const citations: Array<{
    footnoteNumber: number;
    segmentNumber: number;
    rawText: string;
    normalizedText: string;
    citationStage: "first"|"subsequent";
    sourceType: string;
    confidence: number;
    sourceKey?: string;
  }> = [];

  results.forEach((result) => {
    result.segments.forEach((segment, index) => {
      if (segment.sourceKey) {
        sources.set(segment.sourceKey, {
          canonicalKey: segment.sourceKey,
          canonicalName: segment.components.title ?? segment.raw,
          sourceType: segment.sourceType,
          author: segment.components.author,
          title: segment.components.title,
          year: segment.components.year,
          publisher: segment.components.publisher
        });
      }

      citations.push({
        footnoteNumber: result.number,
        segmentNumber: index + 1,
        rawText: segment.raw,
        normalizedText: segment.correctedText,
        citationStage: segment.sourceOccurrence === 1 || segment.occurrence === "first" ? "first" : "subsequent",
        sourceType: segment.sourceType,
        confidence: segment.sourceConfidence,
        sourceKey: segment.sourceKey
      });
    });
  });

  return {
    footnotes,
    sources: Array.from(sources.values()),
    citations
  };
}

export default function DocumentVault(props: Props) {
  const [documents, setDocuments] = useState<PersistedDocument[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const title = useMemo(
    () => props.documentName?.replace(/\.docx$/i, "") || "Untitled legal document",
    [props.documentName]
  );

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      setDocuments(await listMyDocuments());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function saveCurrent() {
    setBusy(true);
    setMessage("");
    try {
      const payload = buildPayload(props.value, props.results);
      const saved = await saveDocument({
        id: props.documentId ?? undefined,
        title,
        fileName: props.documentName,
        footnotes: payload.footnotes,
        sources: payload.sources,
        citations: payload.citations
      });
      props.onDocumentIdChange(saved.id);
      props.onDocumentNameChange(saved.file_name);
      await refresh();
      setMessage("Document saved to your KALCI vault.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const document = await loadDocument(id);
      props.onLoad(document);
      props.onDocumentIdChange(document.id);
      props.onDocumentNameChange(document.file_name ?? document.title);
      setOpen(false);
      setMessage("Document restored. KALCI re-checks its footnotes in the checker.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      props.onDocumentIdChange(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vault-bar">
      <div>
        <span className="eyebrow">DOCUMENT VAULT</span>
        <b>{title}</b>
        <small>{props.documentId ? "Saved document · changes can be saved again" : "Unsaved document · save a copy to your account"}</small>
      </div>
      <div className="vault-actions">
        <button className="secondary" disabled={busy} onClick={saveCurrent}>{busy ? "Working…" : props.documentId ? "Save changes" : "Save document"}</button>
        <button className="ghost" disabled={busy} onClick={() => { setOpen(!open); if (!open) refresh(); }}>{open ? "Close vault" : "Open vault"}</button>
        <button className="ghost" disabled={busy} onClick={handleSignOut}>Sign out</button>
      </div>
      {open && (
        <div className="vault-panel">
          <div className="panel-head">
            <div><h2>Your saved documents</h2><span>private to your account</span></div>
            <button className="ghost" onClick={refresh}>Refresh</button>
          </div>
          {documents.length ? documents.map((doc) => (
            <button className="vault-row" key={doc.id} onClick={() => openDocument(doc.id)}>
              <div><b>{doc.title}</b><small>{doc.file_name ?? "No file name"} · {new Date(doc.updated_at).toLocaleString()}</small></div>
              <span>Open →</span>
            </button>
          )) : <div className="vault-empty">{busy ? "Loading saved documents…" : "No saved documents yet."}</div>}
        </div>
      )}
      {message && <span className="vault-message">{message}</span>}
    </div>
  );
}
