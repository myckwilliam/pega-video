import type { ApiError, JobView, OptionKind, ResolvedVideo } from "@/lib/types";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | (T & Partial<ApiError>)
    | null;

  if (!response.ok) {
    throw new Error(data?.error ?? "Não foi possível concluir a operação.");
  }

  if (!data) {
    throw new Error("Resposta inválida do servidor.");
  }

  return data;
}

export async function resolveUrl(url: string): Promise<ResolvedVideo> {
  const response = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  return parseResponse<ResolvedVideo>(response);
}

export interface StartDownloadInput {
  url: string;
  selector: string;
  kind: OptionKind;
  mergeExt?: string | null;
  title: string;
  label: string | null;
}

export async function startDownload(
  input: StartDownloadInput,
): Promise<JobView> {
  const response = await fetch("/api/downloads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await parseResponse<{ job: JobView }>(response);
  return data.job;
}

export async function fetchJobs(): Promise<JobView[]> {
  const response = await fetch("/api/downloads", { cache: "no-store" });
  const data = await parseResponse<{ jobs: JobView[] }>(response);
  return data.jobs;
}

export async function cancelDownload(id: string): Promise<void> {
  const response = await fetch(`/api/downloads?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  await parseResponse<{ ok: boolean }>(response);
}
