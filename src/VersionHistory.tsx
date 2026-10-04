import { useEffect, useMemo, useState } from "react";
import { listDocumentVersions, type DocumentVersion } from "./supabase";

type Props = {
  documentId: string | null;
  refreshKey?: number;
};

type SnapshotFootnote = { number: number; rawText: string };

function footnotesOf(version: DocumentVersion | undefined): SnapshotFootnote[] {
  const value = version?.snapshot_json?.footnotes;
  return Array.isArray(value)
    ? value.filter((item): item is SnapshotFootnote =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as SnapshotFootnote).number === "number" &&
        typeof (item as SnapshotFootnote).rawText === "string"
      )
    : [];
}

function diffVersions(current: DocumentVersion, previous: DocumentVersion) {
  const oldNotes = new Map(footnotesOf(previous).map((note) => [note.number, note.rawText]));
  const newNotes = new Map(footnotesOf(current).map((note) => [note.number, note.rawText]));
  const changed: number[] = [];
  const added: number[] = [];
  const removed: number[] = [];

  for (const [number, text] of newNotes) {
    if (!oldNotes.has(number)) added.push(number);
    else if (oldNotes.get(number) !== text) changed.push(number);
  }
  for (const number of oldNotes.keys()) if (!newNotes.has(number)) removed.push(number);

  return { changed, added, removed };
}

export default function VersionHistory({ documentId, refreshKey = 0 }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!documentId) {
      setVersions([]);
      return;
    }
    setBusy(true);
    try {
      setVersions(await listDocumentVersions(documentId));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [documentId, refreshKey]);

  const comparison = useMemo(() => {
    if (selected === null) return null;
    const index = versions.findIndex((version) => version.version_number === selected);
    const current = versions[index];
    const previous = versions[index + 1];
    return current && previous ? { current, previous, diff: diffVersions(current, previous) } : null;
  }, [selected, versions]);

  if (!documentId) return null;

  return (
    <section className="version-history">
      <div className="panel-head">
        <div>
          <h2>Version history</h2>
          <span>saved citation snapshots and document changes</span>
        </div>
        <div className="version-actions">
          <span className="version-count">{versions.length} version{versions.length === 1 ? "" : "s"}</span>
          <button className="ghost" onClick={() => { setOpen(!open); if (!open) refresh(); }}>{open ? "Close history" : "Open history"}</button>
        </div>
      </div>

      {open && (
        <>
          {versions.length ? (
            <div className="version-list">
              {versions.map((version) => (
                <button
                  className={selected === version.version_number ? "version-row active" : "version-row"}
                  key={version.id}
                  onClick={() => setSelected(version.version_number)}
                >
                  <div>
                    <b>Version {version.version_number}</b>
                    <small>{new Date(version.created_at).toLocaleString()} · {version.total_footnotes} footnotes</small>
                  </div>
                  <span>{version.score}% · {version.error_count}E · {version.warning_count}W · {version.review_count}R</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="version-empty">{busy ? "Loading version history…" : "No versions have been saved yet."}</div>
          )}

          {comparison && (
            <div className="version-comparison">
              <div className="comparison-title">
                <b>Version {comparison.current.version_number} vs version {comparison.previous.version_number}</b>
                <span>
                  {comparison.diff.changed.length} changed · {comparison.diff.added.length} added · {comparison.diff.removed.length} removed
                </span>
              </div>
              <div className="change-chips">
                {comparison.diff.changed.map((number) => <span key={"c" + number}>FN {number} changed</span>)}
                {comparison.diff.added.map((number) => <span key={"a" + number}>FN {number} added</span>)}
                {comparison.diff.removed.map((number) => <span key={"r" + number}>FN {number} removed</span>)}
              </div>
              <small className="version-note">This comparison tracks exact saved footnote text. Citation-level findings are preserved inside each version snapshot.</small>
            </div>
          )}

          {message && <div className="version-message">{message}</div>}
        </>
      )}
    </section>
  );
}
