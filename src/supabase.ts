import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);
export const supabase = supabaseConfigured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

async function getJson<T>(path: string): Promise<T> {
  if (!url || !key) throw new Error("Supabase is not configured.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function loadKalciStyle(): Promise<{name:string;version:string;status:string} | null> {
  if (!url || !key) return null;
  const rows = await getJson<Array<{name:string;version:string;status:string}>>(
    "citation_styles?select=name,version,status&name=eq.KALCI&limit=1"
  );
  return rows[0] ?? null;
}

export type KalciSourceType = {
  id: string;
  name: string;
  code: string;
  description: string | null;
};

export type KalciTemplate = {
  source_type_id: string;
  citation_stage: "first" | "subsequent";
  template_text: string;
  example: string | null;
  notes: string | null;
};

export async function loadKalciCatalog(): Promise<{sourceTypes: KalciSourceType[]; templates: KalciTemplate[]}> {
  if (!url || !key) return { sourceTypes: [], templates: [] };
  const [sourceTypes, templates] = await Promise.all([
    getJson<KalciSourceType[]>("source_types?select=id,name,code,description&active=eq.true&order=name"),
    getJson<KalciTemplate[]>("citation_templates?select=source_type_id,citation_stage,template_text,example,notes")
  ]);
  return { sourceTypes, templates };
}

export type PersistedDocument = {
  id: string;
  title: string;
  file_name: string | null;
  status: string;
  updated_at: string;
};

export type PersistedDocumentData = PersistedDocument & {
  footnotes: Array<{ footnote_number: number; raw_text: string; validation_status: string }>;
  sources: Array<{ id: string; canonical_key: string; canonical_name: string; source_type: string | null }>;
  aliases: Array<{ source_id: string; alias_text: string; alias_type: string; confidence: number | null }>;
};

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function throwOnError(promise: PromiseLike<{ error: { message: string } | null }>, label: string) {
  const { error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
}

function normalizeAlias(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export async function saveDocument(input: {
  id?: string;
  title: string;
  fileName?: string | null;
  styleId?: string | null;
  footnotes: Array<{ number: number; rawText: string; validationStatus: "pending"|"valid"|"error"|"warning"|"review" }>;
  sources: Array<{
    canonicalKey: string;
    canonicalName: string;
    sourceType: string;
    author?: string;
    title?: string;
    year?: string;
    publisher?: string;
    metadata?: Record<string, unknown>;
  }>;
  citations: Array<{
    footnoteNumber: number;
    segmentNumber: number;
    rawText: string;
    normalizedText: string;
    citationStage: "first"|"subsequent";
    sourceType: string;
    confidence: number;
    sourceKey?: string;
    occurrenceIndex?: number;
  }>;
}): Promise<PersistedDocument> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Sign in before saving a document.");

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .upsert({
      ...(input.id ? { id: input.id } : {}),
      user_id: session.user.id,
      title: input.title,
      file_name: input.fileName ?? null,
      citation_style_id: input.styleId ?? null,
      status: "analyzed"
    })
    .select("id,title,file_name,status,updated_at")
    .single();

  if (documentError) throw documentError;

  const documentId = document.id as string;

  await throwOnError(
    supabase.from("citation_occurrences").delete().eq("document_id", documentId),
    "Could not clear citation occurrences"
  );
  await throwOnError(
    supabase.from("citations").delete().eq("document_id", documentId),
    "Could not clear citations"
  );
  await throwOnError(
    supabase.from("footnotes").delete().eq("document_id", documentId),
    "Could not clear footnotes"
  );
  await throwOnError(
    supabase.from("sources").delete().eq("document_id", documentId),
    "Could not clear sources"
  );

  if (input.footnotes.length) {
    const { error } = await supabase.from("footnotes").insert(
      input.footnotes.map((footnote) => ({
        document_id: documentId,
        footnote_number: footnote.number,
        raw_text: footnote.rawText,
        validation_status: footnote.validationStatus
      }))
    );
    if (error) throw error;
  }

  const { data: sourceRows, error: sourceError } = input.sources.length
    ? await supabase.from("sources").insert(
        input.sources.map((source) => ({
          document_id: documentId,
          canonical_key: source.canonicalKey,
          canonical_name: source.canonicalName,
          source_type: source.sourceType,
          author: source.author ?? null,
          title: source.title ?? null,
          year: source.year ?? null,
          publisher: source.publisher ?? null,
          metadata_json: source.metadata ?? {}
        }))
      ).select("id,canonical_key")
    : { data: [], error: null };

  if (sourceError) throw sourceError;
  const sourceIdByKey = new Map((sourceRows ?? []).map((row) => [row.canonical_key as string, row.id as string]));

  if (sourceRows?.length && input.citations.length) {
    const aliases = input.citations
      .filter((citation) => citation.sourceKey && sourceIdByKey.has(citation.sourceKey))
      .map((citation) => ({
        source_id: sourceIdByKey.get(citation.sourceKey as string)!,
        alias_text: citation.rawText,
        normalized_alias: normalizeAlias(citation.rawText),
        alias_type: citation.citationStage === "first" ? "first-form" : "subsequent-form",
        confidence: citation.confidence
      }));
    if (aliases.length) {
      const { error: aliasError } = await supabase.from("source_aliases").insert(aliases);
      if (aliasError) throw aliasError;
    }
  }

  if (input.citations.length) {
    const { data: footnoteRows, error: footnoteError } = await supabase
      .from("footnotes")
      .select("id,footnote_number")
      .eq("document_id", documentId);

    if (footnoteError) throw footnoteError;
    const footnoteIdByNumber = new Map((footnoteRows ?? []).map((row) => [row.footnote_number as number, row.id as string]));

    const { data: citationRows, error } = await supabase.from("citations").insert(
      input.citations.map((citation) => ({
        document_id: documentId,
        footnote_id: footnoteIdByNumber.get(citation.footnoteNumber) ?? null,
        source_id: citation.sourceKey ? sourceIdByKey.get(citation.sourceKey) ?? null : null,
        raw_text: citation.rawText,
        normalized_text: citation.normalizedText,
        citation_stage: citation.citationStage,
        source_type: citation.sourceType,
        confidence: citation.confidence,
        validation_status: "pending"
      }))
    ).select("id,footnote_id,source_id");

    if (error) throw error;

    if (citationRows?.length) {
      const citationIdByPair = new Map(
        citationRows.map((row, index) => [`${row.footnote_id}|${input.citations[index].segmentNumber}`, row.id as string])
      );

      const occurrenceRows = input.citations.flatMap((citation) => {
        const footnoteId = footnoteIdByNumber.get(citation.footnoteNumber);
        const citationId = footnoteId ? citationIdByPair.get(`${footnoteId}|${citation.segmentNumber}`) : undefined;
        if (!citationId) return [];
        return [{
          document_id: documentId,
          citation_id: citationId,
          source_id: citation.sourceKey ? sourceIdByKey.get(citation.sourceKey) ?? null : null,
          footnote_number: citation.footnoteNumber,
          segment_number: citation.segmentNumber,
          occurrence_index: citation.occurrenceIndex ?? null,
          citation_stage: citation.citationStage,
          raw_text: citation.rawText,
          normalized_text: citation.normalizedText,
          source_confidence: citation.confidence
        }];
      });

      if (occurrenceRows.length) {
        const { error: occurrenceError } = await supabase.from("citation_occurrences").insert(occurrenceRows);
        if (occurrenceError) throw occurrenceError;
      }
    }
  }

  return document as PersistedDocument;
}

export async function listMyDocuments(): Promise<PersistedDocument[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("documents")
    .select("id,title,file_name,status,updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as PersistedDocument[];
}

export async function loadDocument(id: string): Promise<PersistedDocumentData> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,title,file_name,status,updated_at")
    .eq("id", id)
    .single();
  if (documentError) throw documentError;

  const { data: footnotes, error: footnoteError } = await supabase
    .from("footnotes")
    .select("footnote_number,raw_text,validation_status")
    .eq("document_id", id)
    .order("footnote_number", { ascending: true });
  if (footnoteError) throw footnoteError;

  const { data: sources, error: sourceError } = await supabase
    .from("sources")
    .select("id,canonical_key,canonical_name,source_type")
    .eq("document_id", id);
  if (sourceError) throw sourceError;

  const sourceIds = (sources ?? []).map((source) => source.id);
  const { data: aliases, error: aliasError } = sourceIds.length
    ? await supabase.from("source_aliases").select("source_id,alias_text,alias_type,confidence").in("source_id", sourceIds)
    : { data: [], error: null };
  if (aliasError) throw aliasError;

  return {
    ...(document as PersistedDocument),
    footnotes: (footnotes ?? []) as PersistedDocumentData["footnotes"],
    sources: (sources ?? []) as PersistedDocumentData["sources"],
    aliases: (aliases ?? []) as PersistedDocumentData["aliases"]
  };
}
