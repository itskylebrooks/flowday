export interface JsonResponse { ok?: boolean; [k: string]: unknown }

export async function postJSON(path: string, body: unknown): Promise<{ res: Response; data: JsonResponse | null }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data: JsonResponse | null = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { res, data };
}
