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
      return "bg-emerald-400";
    case "error":
      return "bg-rose-400";
    case "canceled":
      return "bg-white/25";
    default:
      return "bg-gradient-to-r from-[#ff5c38] to-[#ffb020]";
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
    <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-[#101016]/95 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      <div className="flex items-start gap-3 p-4 pb-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            job.status === "ready"
              ? "bg-emerald-400/15 text-emerald-300"
              : job.status === "error"
                ? "bg-rose-400/15 text-rose-300"
                : "bg-gradient-to-br from-[#ff6a3d]/25 to-[#ffb020]/10 text-[#ffb020]"
          }`}
        >
          {job.status === "ready" ? (
            <CheckIcon className="h-4.5 w-4.5" />
          ) : job.status === "error" ? (
            <AlertIcon className="h-4.5 w-4.5" />
          ) : active ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Icon className="h-4.5 w-4.5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white/90">
            {job.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-white/35">
            {job.label ? `${job.label} · ` : ""}
            {job.status === "ready"
              ? `${formatBytes(job.size)} · ${job.filename ?? ""}`
              : statusText(job)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(job.id)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/30 transition hover:bg-white/5 hover:text-white/70"
          aria-label="Fechar"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-4">
        <div
          className={`h-1.5 overflow-hidden rounded-full ${
            job.status === "preparing" ? "bg-white/8" : "bg-white/[0.06]"
          }`}
        >
          {job.status === "preparing" ? (
            <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#ff5c38] to-[#ffb020]" />
          ) : (
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${barColor(job)} ${
                job.status === "processing" ? "animate-pulse" : ""
              }`}
              style={{ width: progressWidth(job) }}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 py-2.5">
          <div className="min-w-0 text-[11px] text-white/40">
            {job.status === "downloading" && (
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums text-white/60">
                  {Math.round(job.progress)}%
                </span>
                {job.speed && <span>· {job.speed}</span>}
                {job.eta && <span>· restam {job.eta}</span>}
              </span>
            )}
            {job.status === "ready" && (
              <span className="text-emerald-300/80">
                Se o download não abriu, use “Salvar arquivo”.
              </span>
            )}
            {job.status === "error" && (
              <span className="line-clamp-2 text-rose-300/80">{job.error}</span>
            )}
            {job.status === "canceled" && <span>Download cancelado.</span>}
            {job.status === "processing" && <span>Isso pode levar alguns segundos.</span>}
            {job.status === "preparing" && <span>Conectando ao site…</span>}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {job.status === "ready" && (
              <a
                href={`/api/downloads/file?id=${encodeURIComponent(job.id)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-400/25"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Salvar
              </a>
            )}
            {active && (
              <button
                type="button"
                onClick={() => onCancel(job.id)}
                className="rounded-lg px-2.5 py-1.5 text-[11px] text-white/40 transition hover:bg-white/5 hover:text-white/70"
              >
                Cancelar
              </button>
            )}
            {(job.status === "error" || job.status === "canceled") && (
              <button
                type="button"
                onClick={() => onDismiss(job.id)}
                className="rounded-lg px-2.5 py-1.5 text-[11px] text-white/40 transition hover:bg-white/5 hover:text-white/70"
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
