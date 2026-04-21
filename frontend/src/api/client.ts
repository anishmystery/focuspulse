const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:4000/";

type ApiRequestOptions = RequestInit & {
  bodyJson?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { bodyJson, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: bodyJson !== undefined ? JSON.stringify(bodyJson) : rest.body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw (
      data ?? {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server response.",
        },
      }
    );
  }

  return data as T;
}
