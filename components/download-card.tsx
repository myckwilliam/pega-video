"use client";

import { useEffect } from "react";

import { formatBytes } from "@/lib/format";
import type { JobView } from "@/lib/types";
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  FilmIcon,
  MusicIcon,
  Spinner,
} from "@/components/icons";

const autoSaved = new Set<string>();

function isActive(job: JobView): boolean {
  return (
    job.status === "preparing" ||
    job.status === "downloading" ||
    job.status === "processing"
  );
}

function progressWidth(job: JobView): string {
  if (job.status === "ready" || job.status === "processing") return "100%";
  if (job.status === "error" || job.status === "canceled") return "100%";
  return `${Math.max(0, Math.min(100, job.progress))}%`;
}

function barColor(job: JobView): string {
  switch (job.status) {
    case "ready":
      return "bg-green";
    case "error":
      return "bg-tomato";
    case "canceled":
      return "bg-ink/30";
    default:
      return "bg-orange";
  }
}

function statusText(job: JobView): string {
  switch (job.status) {
    case "preparing":
      return "Buscando informações…";
    case "downloading":
      return `${Math.round(job.progress)}%`;
    case "processing":
      return job.kind === "mp3" ? "Convertendo para MP3…" : "Juntando vídeo e áudio…";
    case "ready":
      return "Download iniciado";
    case "error":
      return "Falhou";
    case "canceled":
      return "Cancelado";
  }
}

export function DownloadCard({
  job,
  onCancel,
  onDismiss,
}: {
  job: JobView;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (job.status !== "ready" || autoSaved.has(job.id)) return;
    autoSaved.add(job.id);

    const anchor = document.createElement("a");
    anchor.href = `/api/downloads/file?id=${encodeURIComponent(job.id)}`;
    if (job.filename) anchor.download = job.filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [job.status, job.id, job.filename]);

  const active = isActive(job);
  const Icon = job.kind === "audio" || job.kind === "mp3" ? MusicIcon : FilmIcon;

  return (
    <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border-[3px] border-ink bg-paper shadow-brutal-lg">
      <div className="flex items-start gap-3 border-b-[3px] border-ink bg-cream/60 p-4 pb-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border-[3px] border-ink text-ink shadow-brutal-sm ${
            job.status === "ready"
              ? "bg-green"
              : job.status === "error"
                ? "bg-tomato"
                : job.status === "canceled"
                  ? "bg-ink/15"
                  : "bg-yellow"
          }`}
        >
          {job.status === "ready" ? (
            <CheckIcon className="h-4 w-4" />
          ) : job.status === "error" ? (
            <AlertIcon className="h-4 w-4" />
          ) : active ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-bold leading-snug">
            {job.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-mute">
            {job.label ? `${job.label} · ` : ""}
            {job.status === "ready"
              ? `${formatBytes(job.size)} · ${job.filename ?? ""}`
              : statusText(job)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(job.id)}
          className="brutal-icon-btn h-7 w-7 shrink-0"
          aria-label="Fechar"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-4 pt-3">
        <div className="h-3 overflow-hidden rounded-full border-[3px] border-ink bg-cream">
          {job.status === "preparing" ? (
            <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-orange" />
          ) : (
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${barColor(job)} ${
                job.status === "processing" ? "animate-pulse" : ""
              }`}
              style={{ width: progressWidth(job) }}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2.5">
          <div className="min-w-0 text-[11px] font-bold text-mute">
            {job.status === "downloading" && (
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums text-ink">
                  {Math.round(job.progress)}%
                </span>
                {job.speed && <span>· {job.speed}</span>}
                {job.eta && <span>· restam {job.eta}</span>}
              </span>
            )}
            {job.status === "ready" && (
              <span className="text-ink/70">
                Se o download não abriu, use “Salvar arquivo”.
              </span>
            )}
            {job.status === "error" && (
              <span className="line-clamp-2 text-ink">{job.error}</span>
            )}
            {job.status === "canceled" && <span>Download cancelado.</span>}
            {job.status === "processing" && <span>Isso pode levar alguns segundos.</span>}
            {job.status === "preparing" && <span>Conectando ao site…</span>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {job.status === "ready" && (
              <a
                href={`/api/downloads/file?id=${encodeURIComponent(job.id)}`}
                className="brutal-btn h-8 bg-green px-2.5 text-[10px] uppercase tracking-wide"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Salvar
              </a>
            )}
            {active && (
              <button
                type="button"
                onClick={() => onCancel(job.id)}
                className="brutal-btn-ghost h-8 px-2.5 text-[10px] uppercase tracking-wide"
              >
                Cancelar
              </button>
            )}
            {(job.status === "error" || job.status === "canceled") && (
              <button
                type="button"
                onClick={() => onDismiss(job.id)}
                className="brutal-btn-ghost h-8 px-2.5 text-[10px] uppercase tracking-wide"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
