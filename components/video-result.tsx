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
      className={`group flex items-center gap-3 rounded-xl border-[3px] p-2.5 transition-[transform,box-shadow,border-color,background-color] sm:p-3 ${
        isBest
          ? "border-ink bg-yellow/70 shadow-brutal-sm"
          : "border-ink/25 bg-paper hover:border-ink hover:bg-cream hover:shadow-brutal-sm"
      }`}
    >
      <div
        className={`flex h-11 w-[68px] shrink-0 flex-col items-center justify-center rounded-lg border-[3px] border-ink px-1.5 text-ink ${
          isBest
            ? "bg-tomato shadow-brutal-sm"
            : isAudio
              ? "bg-pink/60"
              : "bg-blue/40"
        }`}
      >
        {isAudio ? (
          <MusicIcon className="h-4 w-4" />
        ) : (
          <span className="font-display text-[11px] tracking-tight">
            {option.label}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold">
            {isAudio ? option.label : isBest ? "Melhor qualidade" : option.label}
          </span>
          {option.recommended && (
            <span className="shrink-0 rounded-full border-2 border-ink bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cream">
              Top
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-bold uppercase tracking-wide text-mute">
          {option.ext && <span>{option.ext}</span>}
          {option.vcodec && <span>{option.vcodec}</span>}
          {option.acodec && <span>{option.acodec}</span>}
          {option.fps && option.fps > 30 && <span>{option.fps} fps</span>}
          <span>
            {option.filesize
              ? formatBytes(option.filesize, true)
              : "tamanho variável"}
          </span>
          {option.note && (
            <span className="hidden text-mute/70 sm:inline">· {option.note}</span>
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
        className={`h-9 shrink-0 px-3 text-xs uppercase tracking-wide disabled:cursor-wait ${
          isBest ? "brutal-btn-primary" : "brutal-btn-ghost"
        }`}
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
      className="brutal-card-lg mt-8 scroll-mt-6 animate-[fade-up_0.4s_ease-out] overflow-hidden"
      aria-live="polite"
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[240px_1fr] sm:p-5">
        <div className="relative aspect-video overflow-hidden rounded-xl border-[3px] border-ink bg-blue/30 sm:aspect-auto sm:min-h-[150px]">
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="grid h-full min-h-[150px] w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,#F9A8C9_0%,#F9A8C9_38%,#FBF4E4_38%)] text-ink">
              <FilmIcon className="h-8 w-8" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/30 via-transparent to-transparent" />
          {video.duration && (
            <span className="absolute bottom-2 right-2 rounded-md border-2 border-ink bg-ink px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-cream">
              {formatDuration(video.duration)}
            </span>
          )}
          {video.isLive && (
            <span className="absolute left-2 top-2 flex -rotate-3 items-center gap-1 rounded-full border-[3px] border-ink bg-tomato px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink shadow-brutal-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
              Ao vivo
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
              <GlobeIcon className="h-3 w-3" />
              {video.domain}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-mute">
              via {video.extractor}
            </span>
          </div>

          <h2 className="mt-2 line-clamp-2 font-display text-lg uppercase leading-[1.05] sm:text-2xl">
            {video.title}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-wide text-mute">
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
            className="link-brutal mt-3 inline-flex w-fit items-center gap-1 text-xs"
          >
            Abrir página original
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="border-t-[3px] border-ink bg-cream/50 px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl border-[3px] border-ink bg-cream p-1 shadow-brutal-sm">
            <button
              type="button"
              onClick={() => setTab("video")}
              className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                tab === "video"
                  ? "border-ink bg-yellow shadow-brutal-sm"
                  : "border-transparent text-ink/60 hover:bg-paper hover:text-ink"
              }`}
            >
              <FilmIcon className="h-3.5 w-3.5" />
              Vídeo
              <span className="rounded-full border-2 border-ink bg-paper px-1.5 text-[9px] text-ink">
                {video.videoOptions.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab("audio")}
              className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                tab === "audio"
                  ? "border-ink bg-yellow shadow-brutal-sm"
                  : "border-transparent text-ink/60 hover:bg-paper hover:text-ink"
              }`}
            >
              <MusicIcon className="h-3.5 w-3.5" />
              Áudio
              <span className="rounded-full border-2 border-ink bg-paper px-1.5 text-[9px] text-ink">
                {video.audioOptions.length}
              </span>
            </button>
          </div>

          <span className="text-[10px] font-bold uppercase tracking-wide text-mute">
            {options.length} {options.length === 1 ? "opção" : "opções"}{" "}
            disponíveis
          </span>
        </div>

        <div className="mt-4 space-y-2">
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

        <p className="mt-3 text-[11px] font-medium leading-relaxed text-mute">
          {tab === "video"
            ? "Vídeos sem áudio na origem são mesclados automaticamente com a melhor trilha de áudio disponível."
            : "O MP3 é convertido localmente com ffmpeg. Os demais formatos mantêm o áudio original."}
        </p>
      </div>
    </section>
  );
}
