export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(
    `/api${path}`,
    body === undefined
      ? { credentials: "same-origin", cache: "no-store" }
      : {
          method,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir");
  return data as T;
}
