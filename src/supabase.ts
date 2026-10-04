const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

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
