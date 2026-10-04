const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export async function loadKalciStyle(): Promise<{name:string;version:string;status:string} | null> {
  if (!url || !key) return null;
  const endpoint = `${url}/rest/v1/citation_styles?select=name,version,status&name=eq.KALCI&limit=1`;
  const response = await fetch(endpoint, { headers: { apikey: key } });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  const rows = await response.json() as Array<{name:string;version:string;status:string}>;
  return rows[0] ?? null;
}
