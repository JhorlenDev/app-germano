export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "gm-app",
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Não foi possível acessar o servidor." }));
  if (!response.ok)
    throw new ApiError(data.error || "Falha na solicitação.", response.status);
  return data;
}
export function downloadJSON(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
