import { toast } from "sonner";
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let msg = "Request failed. Please try again.";
    try {
      const data = await res.json();
      msg =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
    } catch {}
    throw new APIError(res.status, msg);
  }
  return res.json();
}
export const post = <T = any>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export async function download(path: string, filename: string) {
  try {
    const r = await fetch("/api" + path, { credentials: "include" });
    if (!r.ok) throw new Error("Export failed. Try again.");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Your download is ready.");
  } catch (e) {
    toast.error((e as Error).message);
  }
}
