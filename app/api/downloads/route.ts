import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { cancelJob, createJob, getJob, listJobs } from "@/lib/jobs";
import type { OptionKind } from "@/lib/types";
import { isSafeSelector, normalizeInputUrl, sanitizeFilename } from "@/lib/ytdlp";

export const maxDuration = 60;

const KINDS: OptionKind[] = ["best", "video", "audio", "mp3"];
const MERGE_EXTENSIONS = ["mp4", "webm", "mkv"];

function parseKind(value: unknown): OptionKind {
  if (typeof value === "string" && KINDS.includes(value as OptionKind)) {
    return value as OptionKind;
  }
  throw new AppError("Tipo de download inválido.", 400);
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new AppError("Requisição inválida.", 400);
    }

    const data = body as Record<string, unknown>;
    const url = normalizeInputUrl(data.url);
    const kind = parseKind(data.kind);

    let selector = "";
    if (kind === "video" || kind === "audio") {
      if (!isSafeSelector(data.selector)) {
        throw new AppError("Formato de vídeo inválido.", 400);
      }
      selector = data.selector;
    }

    const mergeExt =
      kind === "video" &&
      typeof data.mergeExt === "string" &&
      MERGE_EXTENSIONS.includes(data.mergeExt)
        ? data.mergeExt
        : null;

    const title = sanitizeFilename(
      typeof data.title === "string" ? data.title : "video",
    );
    const label =
      typeof data.label === "string" && data.label.trim()
        ? sanitizeFilename(data.label, 40)
        : null;

    const job = await createJob({
      url,
      selector,
      kind,
      mergeExt,
      title,
      label,
    });

    return Response.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");

    if (id) {
      const job = getJob(id);
      if (!job) {
        return Response.json({ error: "Download não encontrado." }, { status: 404 });
      }
      return Response.json({ job });
    }

    return Response.json({ jobs: listJobs() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new AppError("Download não informado.", 400);

    const canceled = await cancelJob(id);
    if (!canceled) {
      return Response.json({ error: "Download não encontrado." }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
