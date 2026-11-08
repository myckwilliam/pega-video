import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { getJob, getJobFile } from "@/lib/jobs";

export const maxDuration = 60;

const MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  flv: "video/x-flv",
  "3gp": "video/3gpp",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
};

function contentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function mimeFor(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Download não informado." }, { status: 400 });
  }

  const job = getJob(id);
  if (!job) {
    return Response.json({ error: "Download não encontrado." }, { status: 404 });
  }

  const file = getJobFile(id);
  if (!file) {
    return Response.json(
      { error: "O arquivo ainda não está pronto." },
      { status: 409 },
    );
  }

  const stat = await fs.promises.stat(file.filePath).catch(() => null);
  if (!stat) {
    return Response.json(
      { error: "O arquivo expirou. Baixe novamente." },
      { status: 410 },
    );
  }

  const headers = new Headers({
    "Content-Type": mimeFor(file.filename),
    "Content-Disposition": contentDisposition(file.filename),
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  });

  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());

    if (match) {
      const [, startRaw, endRaw] = match;

      if (startRaw || endRaw) {
        let start: number;
        let end: number;

        if (!startRaw) {
          const suffix = Number(endRaw);
          if (!Number.isFinite(suffix) || suffix <= 0) {
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${stat.size}` },
            });
          }
          start = Math.max(0, stat.size - suffix);
          end = stat.size - 1;
        } else {
          start = Number(startRaw);
          end = endRaw ? Number(endRaw) : stat.size - 1;
        }

        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          start > end ||
          start >= stat.size
        ) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
        }

        end = Math.min(end, stat.size - 1);

        headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        headers.set("Content-Length", String(end - start + 1));

        const partial = fs.createReadStream(file.filePath, { start, end });
        return new Response(
          Readable.toWeb(partial) as unknown as ReadableStream,
          { status: 206, headers },
        );
      }
    }
  }

  headers.set("Content-Length", String(stat.size));

  const stream = fs.createReadStream(file.filePath);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers,
  });
}
