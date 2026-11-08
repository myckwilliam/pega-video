"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type FormEvent } from "react";

import { DownloadCard } from "@/components/download-card";
import { VideoResult } from "@/components/video-result";
import {
  AlertIcon,
  ClipboardIcon,
  CloseIcon,
  DownloadIcon,
  FilmIcon,
  HistoryIcon,
  LinkIcon,
  LogoIcon,
  SparklesIcon,
  Spinner,
  TrashIcon,
} from "@/components/icons";
import { cancelDownload, fetchJobs, resolveUrl, startDownload } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { FormatOption, JobView, ResolvedVideo } from "@/lib/types";

interface HistoryEntry {
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  domain: string;
  at: number;
}

const HISTORY_KEY = "pega-video:history:v1";
const PLATFORMS = ["YouTube", "TikTok", "Instagram", "X", "Vimeo", "Facebook"];

const STEPS = [
  {
    icon: LinkIcon,
    title: "Cole o link",
    text: "YouTube, TikTok, Instagram, X, Vimeo e mais de mil sites.",
  },
  {
    icon: FilmIcon,
    title: "Escolha a qualidade",
    text: "MP4 em várias resoluções ou só o áudio, em MP3.",
  },
  {
    icon: DownloadIcon,
    title: "Baixe",
    text: "O arquivo é preparado e salvo direto no seu computador.",
  },
];

function isActiveJob(job: JobView): boolean {
  return (
    job.status === "preparing" ||
    job.status === "downloading" ||
    job.status === "processing"
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Algo deu errado. Tente novamente.";
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is HistoryEntry => {
        if (!item || typeof item !== "object") return false;
        const entry = item as Record<string, unknown>;
        return typeof entry.url === "string" && typeof entry.title === "string";
      })
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function VideoDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<ResolvedVideo | null>(null);
  const [pendingSelector, setPendingSelector] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pasting, setPasting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const activeJobs = jobs.filter(isActiveJob);
  const hasActiveJobs = activeJobs.length > 0;
  const activeSelectors = new Set(activeJobs.map((job) => job.selector));

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHistory(readHistory()));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let mounted = true;

    fetchJobs()
      .then((list) => {
        if (!mounted) return;
        setJobs(list.filter(isActiveJob));
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasActiveJobs) return;

    let stopped = false;

    const tick = async () => {
      try {
        const list = await fetchJobs();
        if (stopped) return;

        setJobs((current) => {
          const next = new Map(current.map((job) => [job.id, job]));
          for (const job of list) {
            if (next.has(job.id) || isActiveJob(job)) {
              next.set(job.id, job);
            }
          }
          return [...next.values()].sort((a, b) => b.createdAt - a.createdAt);
        });
      } catch {
        // Silencia falhas momentâneas de polling; a próxima tentativa corrige.
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [hasActiveJobs]);

  function saveHistory(entry: HistoryEntry) {
    setHistory((current) => {
      const next = [
        entry,
        ...current.filter((item) => item.url !== entry.url),
      ].slice(0, 8);

      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Espaço indisponível: mantém apenas em memória.
      }

      return next;
    });
  }

  async function analyze(rawUrl?: string) {
    const target = (rawUrl ?? url).trim();

    if (!target) {
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await resolveUrl(target);
      setVideo(result);
      setUrl(result.url);

      saveHistory({
        url: result.url,
        title: result.title,
        thumbnail: result.thumbnail,
        duration: result.duration,
        domain: result.domain,
        at: Date.now(),
      });

      requestAnimationFrame(() => {
        if (window.innerWidth < 900) {
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await analyze();
  }

  async function handlePaste() {
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        setError(null);
        inputRef.current?.focus();
      }
    } catch {
      setError(
        "Não foi possível ler a área de transferência. Cole o link manualmente.",
      );
    } finally {
      setPasting(false);
    }
  }

  async function handleDownload(option: FormatOption) {
    if (!video || pendingSelector) return;

    setPendingSelector(option.selector);
    setError(null);

    try {
      const job = await startDownload({
        url: video.url,
        selector: option.selector,
        kind: option.kind,
        mergeExt: option.kind === "video" ? option.ext : null,
        title: video.title,
        label: option.label,
      });

      setJobs((current) => [
        job,
        ...current.filter((item) => item.id !== job.id),
      ]);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setPendingSelector(null);
    }
  }

  function handleDismiss(id: string) {
    setJobs((current) => current.filter((job) => job.id !== id));
  }

  function handleCancel(id: string) {
    setJobs((current) => current.filter((job) => job.id !== id));
    void cancelDownload(id).catch(() => {});
  }

  function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Ignora storage indisponível.
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ff6a3d] to-[#ffb020] text-[#1a0d06] shadow-[0_10px_28px_-10px_rgba(255,106,61,0.85)]">
            <LogoIcon className="h-5 w-5" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-white/90">
            Pega<span className="text-white/40">Vídeo</span>
          </span>
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10.5px] text-white/40 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          roda local · sem anúncios
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-20">
        <section className="relative pt-10 text-center sm:pt-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-16 mx-auto h-64 max-w-2xl rounded-full bg-[radial-gradient(closest-side,rgba(255,106,61,0.16),transparent)] blur-2xl"
          />

          <span className="relative inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/45">
            <SparklesIcon className="h-3 w-3 text-[#ffb020]" />
            Cole. Analise. Baixe.
          </span>

          <h1 className="relative mt-5 text-balance text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.045em] text-white/95 sm:text-6xl">
            Baixe vídeos de
            <br />
            <span className="bg-gradient-to-r from-[#ff8a5b] via-[#ffb020] to-[#ff5c38] bg-clip-text text-transparent">
              qualquer link.
            </span>
          </h1>

          <p className="relative mx-auto mt-4 max-w-xl text-pretty text-[13px] leading-relaxed text-white/40 sm:text-sm">
            Cole a URL de um vídeo e escolha a qualidade. O arquivo é baixado
            direto no seu computador, sem cadastro.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="relative mx-auto mt-8 w-full max-w-2xl rounded-[22px] border border-white/10 bg-[#0e0e14]/80 p-2 shadow-[0_30px_90px_-40px_rgba(0,0,0,1)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 transition focus-within:border-[#ff6a3d]/35 focus-within:bg-white/[0.05]">
              <LinkIcon className="h-4 w-4 shrink-0 text-white/30" />
              <input
                ref={inputRef}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (error) setError(null);
                }}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="Cole o link do vídeo aqui…"
                aria-label="Link do vídeo"
                className="h-12 w-full min-w-0 bg-transparent text-[13px] text-white/85 outline-none placeholder:text-white/25"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl("");
                    inputRef.current?.focus();
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/25 transition hover:bg-white/5 hover:text-white/60"
                  aria-label="Limpar link"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePaste}
                disabled={pasting}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-[12.5px] font-medium text-white/55 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-50 sm:flex-none"
              >
                {pasting ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <ClipboardIcon className="h-4 w-4" />
                )}
                Colar
              </button>

              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#ff5c38] to-[#ff9f1c] px-5 text-[12.5px] font-semibold text-[#1a0d06] shadow-[0_12px_30px_-12px_rgba(255,106,61,0.9)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                {loading ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <SparklesIcon className="h-4 w-4" />
                )}
                {loading ? "Analisando…" : "Analisar link"}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-[10.5px] text-white/25">
          <span className="text-white/20">Funciona com</span>
          {PLATFORMS.map((platform, index) => (
            <span key={platform} className="flex items-center gap-2.5">
              {index > 0 && <span className="text-white/10">·</span>}
              {platform}
            </span>
          ))}
          <span className="text-white/10">·</span>
          <span className="text-white/20">e +1.000 sites</span>
        </div>

        {error && (
          <div className="mx-auto mt-5 flex w-full max-w-2xl items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-3.5 py-3 text-[12px] leading-relaxed text-rose-200/90">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-rose-200/40 transition hover:bg-white/5 hover:text-rose-100"
              aria-label="Fechar erro"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>
        )}

        {loading && !video && (
          <section className="mt-8 animate-pulse overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0c0c11]/60 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
              <div className="aspect-video rounded-2xl bg-white/[0.05] sm:aspect-auto sm:min-h-[150px]" />
              <div className="space-y-3 py-2">
                <div className="h-3 w-20 rounded-full bg-white/[0.05]" />
                <div className="h-4 w-full rounded-full bg-white/[0.06]" />
                <div className="h-4 w-2/3 rounded-full bg-white/[0.05]" />
                <div className="h-3 w-40 rounded-full bg-white/[0.04]" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-16 rounded-xl bg-white/[0.03]" />
              <div className="h-16 rounded-xl bg-white/[0.03]" />
            </div>
          </section>
        )}

        {video && (
          <div ref={resultRef}>
            <VideoResult
              key={video.url}
              video={video}
              onDownload={handleDownload}
              pendingSelector={pendingSelector}
              activeSelectors={activeSelectors}
            />
          </div>
        )}

        {!video && !loading && (
          <div className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-[#ffb020]/80">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-mono text-white/15">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="mt-3 text-[12.5px] font-medium text-white/70">
                    {step.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/30">
                    {step.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {history.length > 0 && (
          <section className="mx-auto mt-12 w-full max-w-2xl">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[12px] font-medium text-white/50">
                <HistoryIcon className="h-3.5 w-3.5" />
                Recentes
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-white/25 transition hover:bg-white/5 hover:text-white/60"
              >
                <TrashIcon className="h-3 w-3" />
                Limpar
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {history.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => void analyze(item.url)}
                  className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2 text-left transition hover:border-white/15 hover:bg-white/[0.04]"
                >
                  <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-white/[0.04]">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-white/20">
                        <FilmIcon className="h-4 w-4" />
                      </div>
                    )}
                    {item.duration ? (
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[9px] tabular-nums text-white/80">
                        {formatDuration(item.duration)}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11.5px] font-medium leading-snug text-white/65 transition group-hover:text-white/90">
                      {item.title}
                    </p>
                    <p className="mt-1 truncate text-[9.5px] uppercase tracking-wide text-white/25">
                      {item.domain}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-4xl px-5 pb-8 text-center text-[10px] leading-relaxed text-white/20">
        <p>
          Use apenas para conteúdo que você tem direito de baixar. O app não
          hospeda arquivos: tudo é processado localmente no seu computador.
        </p>
        <p className="mt-1.5 text-white/15">
          yt-dlp + ffmpeg · sem login · sem rastreamento
        </p>
      </footer>

      {jobs.length > 0 && (
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[380px]">
          {jobs.slice(0, 3).map((job) => (
            <DownloadCard
              key={job.id}
              job={job}
              onCancel={handleCancel}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
