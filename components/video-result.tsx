"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

import {
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FilmIcon,
  GlobeIcon,
  MusicIcon,
  Spinner,
  UserIcon,
} from "@/components/icons";
import { formatBytes, formatCount, formatDuration } from "@/lib/format";
import type { FormatOption, ResolvedVideo } from "@/lib/types";

function OptionRow({
  option,
  onDownload,
  busy,
}: {
  option: FormatOption;
  onDownload: (option: FormatOption) => void;
  busy: boolean;
}) {
  const isBest = option.kind === "best";
  const isAudio = option.kind === "audio" || option.kind === "mp3";

  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border p-2.5 transition sm:p-3 ${
        isBest
          ? "border-[#ff6a3d]/25 bg-gradient-to-r from-[#ff6a3d]/[0.09] via-[#ffb020]/[0.04] to-transparent"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
      }`}
    >
      <div
        className={`flex h-11 w-[68px] shrink-0 flex-col items-center justify-center rounded-lg border px-1.5 ${
          isBest
            ? "border-[#ff6a3d]/30 bg-[#ff6a3d]/10 text-[#ffb687]"
            : isAudio
              ? "border-white/10 bg-white/[0.04] text-white/60"
              : "border-white/10 bg-white/[0.04] text-white/75"
        }`}
      >
        {isAudio ? (
          <MusicIcon className="h-4.5 w-4.5" />
        ) : (
          <span className="text-[11px] font-semibold tracking-tight">
            {option.label}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-white/85">
            {isAudio ? option.label : isBest ? "Melhor qualidade" : option.label}
          </span>
          {option.recommended && (
            <span className="shrink-0 rounded-full border border-[#ff6a3d]/30 bg-[#ff6a3d]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#ffb687]">
              Top
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-white/35">
          {option.ext && <span className="uppercase">{option.ext}</span>}
          {option.vcodec && <span>{option.vcodec}</span>}
          {option.acodec && <span>{option.acodec}</span>}
          {option.fps && option.fps > 30 && <span>{option.fps} fps</span>}
          <span>{option.filesize ? formatBytes(option.filesize, true) : "tamanho variável"}</span>
          {option.note && (
            <span className="hidden text-white/25 sm:inline">· {option.note}</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDownload(option)}
        disabled={busy}
        aria-label={`Baixar ${isBest ? "melhor qualidade" : option.label}${
          option.ext ? ` em ${option.ext}` : ""
        }`}
        className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[11.5px] font-medium transition ${
          isBest
            ? "bg-gradient-to-r from-[#ff5c38] to-[#ff9f1c] text-[#1a0d06] shadow-[0_8px_24px_-10px_rgba(255,106,61,0.9)] hover:brightness-110 disabled:brightness-75"
            : "border border-white/10 bg-white/[0.05] text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-60"
        } disabled:cursor-wait`}
      >
        {busy ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <DownloadIcon className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{busy ? "Baixando" : "Baixar"}</span>
      </button>
    </div>
  );
}

export function VideoResult({
  video,
  onDownload,
  pendingSelector,
  activeSelectors,
}: {
  video: ResolvedVideo;
  onDownload: (option: FormatOption) => void;
  pendingSelector: string | null;
  activeSelectors: Set<string>;
}) {
  const [tab, setTab] = useState<"video" | "audio">("video");
  const options = tab === "video" ? video.videoOptions : video.audioOptions;
  const views = formatCount(video.viewCount);

  return (
    <section
      className="mt-8 scroll-mt-6 animate-[fade-up_0.4s_ease-out] overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c11]/85 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur"
      aria-live="polite"
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[240px_1fr] sm:p-5">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] sm:aspect-auto sm:min-h-[150px]">
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="grid h-full min-h-[150px] w-full place-items-center bg-gradient-to-br from-[#ff6a3d]/15 to-transparent text-[#ffb020]">
              <FilmIcon className="h-8 w-8" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          {video.duration && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/90 backdrop-blur">
              {formatDuration(video.duration)}
            </span>
          )}
          {video.isLive && (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
              Ao vivo
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/50">
              <GlobeIcon className="h-3 w-3" />
              {video.domain}
            </span>
            <span className="text-[10px] text-white/25">via {video.extractor}</span>
          </div>

          <h2 className="mt-2 line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-white/95 sm:text-lg">
            {video.title}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/40">
            {video.uploader && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <UserIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{video.uploader}</span>
              </span>
            )}
            {views && (
              <span className="inline-flex items-center gap-1">
                <EyeIcon className="h-3 w-3" />
                {views} visualizações
              </span>
            )}
            {video.duration && (
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                {formatDuration(video.duration)}
              </span>
            )}
          </div>

          <a
            href={video.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex w-fit items-center gap-1 text-[10.5px] text-white/30 transition hover:text-white/60"
          >
            Abrir página original
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="border-t border-white/[0.07] px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setTab("video")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition ${
                tab === "video"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              <FilmIcon className="h-3.5 w-3.5" />
              Vídeo
              <span className="text-[9px] text-white/30">{video.videoOptions.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("audio")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition ${
                tab === "audio"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              <MusicIcon className="h-3.5 w-3.5" />
              Áudio
              <span className="text-[9px] text-white/30">{video.audioOptions.length}</span>
            </button>
          </div>

          <span className="text-[10px] text-white/25">
            {options.length} {options.length === 1 ? "opção" : "opções"} disponíveis
          </span>
        </div>

        <div className="mt-3 space-y-1.5">
          {options.map((option) => (
            <OptionRow
              key={`${option.kind}-${option.selector}`}
              option={option}
              onDownload={onDownload}
              busy={
                pendingSelector === option.selector ||
                activeSelectors.has(option.selector)
              }
            />
          ))}
        </div>

        <p className="mt-3 text-[10.5px] leading-relaxed text-white/25">
          {tab === "video"
            ? "Vídeos sem áudio na origem são mesclados automaticamente com a melhor trilha de áudio disponível."
            : "O MP3 é convertido localmente com ffmpeg. Os demais formatos mantêm o áudio original."}
        </p>
      </div>
    </section>
  );
}
