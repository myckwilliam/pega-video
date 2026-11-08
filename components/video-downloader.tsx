"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type FormEvent } from "react";

import { DownloadCard } from "@/components/download-card";
import { VideoResult } from "@/components/video-result";
import {
  AlertIcon,
  CheckIcon,
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
const LOCAL_URL_KEY = "pega-video:local-url:v1";
const DEFAULT_LOCAL_URL = "http://localhost:3000";
const PLATFORMS = ["YouTube", "TikTok", "Instagram", "X", "Vimeo", "Facebook"];

const STEPS = [
  {
    icon: LinkIcon,
    title: "Cole o link",
    text: "YouTube, TikTok, Instagram, X, Vimeo e mais de mil sites.",
    color: "bg-pink",
  },
  {
    icon: FilmIcon,
    title: "Escolha a qualidade",
    text: "MP4 em várias resoluções ou só o áudio, em MP3.",
    color: "bg-blue",
  },
  {
    icon: DownloadIcon,
    title: "Baixe",
    text: "O arquivo é preparado e salvo direto no seu computador.",
    color: "bg-yellow",
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

function normalizeLocalUrl(value: string): string | null {
  let raw = value.trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `http://${raw}`;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function VideoDownloader({ serverLocal }: { serverLocal: boolean }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<ResolvedVideo | null>(null);
  const [pendingSelector, setPendingSelector] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pasting, setPasting] = useState(false);
  const [localUrl, setLocalUrl] = useState("");
  const [localUrlDraft, setLocalUrlDraft] = useState("");
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const autoAnalyzedRef = useRef(false);

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

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!serverLocal) {
        const params = new URLSearchParams(window.location.search);
        const fromLink = normalizeLocalUrl(params.get("local") ?? "");

        let stored = "";
        try {
          stored = localStorage.getItem(LOCAL_URL_KEY) ?? "";
        } catch {
          // localStorage indisponível.
        }

        const fallback = window.matchMedia("(pointer: coarse)").matches
          ? ""
          : DEFAULT_LOCAL_URL;
        const resolved =
          fromLink ?? normalizeLocalUrl(stored) ?? fallback;

        setLocalUrl(resolved);
        setLocalUrlDraft(resolved);

        if (fromLink) {
          try {
            localStorage.setItem(LOCAL_URL_KEY, fromLink);
          } catch {
            // Ignora storage indisponível.
          }

          params.delete("local");
          const query = params.toString();
          window.history.replaceState(
            {},
            "",
            `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
          );
        }
      }

      if (serverLocal && !autoAnalyzedRef.current) {
        autoAnalyzedRef.current = true;
        const initial = new URLSearchParams(window.location.search).get("url");
        if (initial) {
          setUrl(initial);
          void analyze(initial);
        }
      }
    });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!serverLocal) {
      handleProcessLocal();
      return;
    }

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

  function handleProcessLocal() {
    if (!localUrl) {
      setLocalError(
        "No celular, configure o endereço do seu computador: IP na mesma Wi-Fi ou uma URL de túnel.",
      );
      setLocalSettingsOpen(true);
      return;
    }

    let target: URL;
    try {
      target = new URL(localUrl);
    } catch {
      setLocalError("O endereço configurado não é uma URL válida.");
      setLocalSettingsOpen(true);
      return;
    }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      setLocalError("Use um endereço http:// ou https://.");
      setLocalSettingsOpen(true);
      return;
    }

    const loopback = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
    const phone = window.matchMedia("(pointer: coarse)").matches;

    if (loopback && phone) {
      setLocalError(
        "No celular, localhost aponta para o próprio celular. Use o IP do Mac ou uma URL de túnel.",
      );
      setLocalSettingsOpen(true);
      return;
    }

    if (url.trim()) target.searchParams.set("url", url.trim());

    window.open(target.toString(), "_blank", "noopener,noreferrer");
  }

  function saveLocalUrl() {
    const normalized = normalizeLocalUrl(localUrlDraft);

    if (!normalized) {
      setLocalError("Endereço inválido. Exemplo: http://localhost:3000");
      return;
    }

    try {
      localStorage.setItem(LOCAL_URL_KEY, normalized);
    } catch {
      // Ignora storage indisponível; vale para a sessão atual.
    }

    setLocalUrl(normalized);
    setLocalUrlDraft(normalized);
    setLocalError(null);
    setLocalSettingsOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b-[3px] border-ink bg-cream/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-lg border-[3px] border-ink bg-tomato text-ink shadow-brutal-sm">
              <LogoIcon className="h-5 w-5" />
            </span>
            <span className="font-display text-xl uppercase leading-none">
              Pega
              <span className="ml-1 inline-block bg-yellow px-1 text-ink">
                Vídeo
              </span>
            </span>
          </div>

          <div className="hidden items-center gap-2 rounded-full border-[3px] border-ink bg-paper px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] shadow-brutal-sm sm:flex">
            <span className="h-2 w-2 rounded-full border-2 border-ink bg-green" />
            {serverLocal ? "roda local · sem anúncios" : "demo online · use sua máquina"}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 sm:px-6">
        <section className="relative pt-10 text-center sm:pt-16">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <span className="sticker -rotate-2 bg-pink">
              <SparklesIcon className="h-3 w-3" />
              cole. analise. baixe.
            </span>
            <span className="sticker rotate-1 bg-green">sem cadastro</span>
          </div>

          <h1 className="font-display text-[clamp(32px,10.5vw,44px)] uppercase leading-[0.85] sm:text-7xl">
            Baixe vídeos
            <span className="hidden sm:inline"> de</span>
            <br />
            <span className="mt-1 inline-block -rotate-1 bg-yellow px-2 text-ink [box-decoration-break:clone]">
              <span className="sm:hidden">de </span>
              qualquer link.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-pretty text-sm font-medium leading-relaxed text-ink/75">
            {serverLocal
              ? "Cole a URL de um vídeo e escolha a qualidade. O arquivo é baixado direto no seu computador, sem cadastro."
              : "Cole a URL e escolha a qualidade. Para baixar, processe na sua máquina com o IP da sua casa."}
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="brutal-card-lg relative mx-auto mt-8 w-full max-w-2xl p-2.5"
        >
          <div className="absolute -top-3.5 left-6 z-10 -rotate-3">
            <span className="sticker bg-orange">
              {serverLocal ? "100% local" : "modo demo"}
            </span>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border-[3px] border-ink bg-cream px-3 shadow-brutal-sm transition-shadow focus-within:shadow-brutal">
              <LinkIcon className="h-4 w-4 shrink-0 text-ink/50" />
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
                className="h-12 w-full min-w-0 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-mute/60"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl("");
                    inputRef.current?.focus();
                  }}
                  className="brutal-icon-btn h-7 w-7 shrink-0"
                  aria-label="Limpar link"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handlePaste}
                disabled={pasting}
                className="brutal-btn-ghost h-12 flex-1 px-3 text-xs uppercase tracking-wide sm:flex-none sm:px-4 sm:text-sm"
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
                className="brutal-btn-primary h-12 flex-1 px-3 text-xs uppercase tracking-wide sm:flex-none sm:px-5 sm:text-sm"
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

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-mute">
          <span className="mr-1">Funciona com</span>
          {PLATFORMS.map((platform) => (
            <span key={platform} className="chip px-2.5 py-0.5 text-[10px]">
              {platform}
            </span>
          ))}
          <span className="chip bg-yellow px-2.5 py-0.5 text-[10px]">
            +1.000 sites
          </span>
        </div>

        {!serverLocal && (
          <section className="brutal-card mx-auto mt-6 w-full max-w-2xl p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border-[3px] border-ink bg-green text-ink shadow-brutal-sm">
                <DownloadIcon className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-display text-sm uppercase">Processar na sua máquina</p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug text-mute">
                  Use o IP da sua casa para baixar sem bloqueios e sem os limites do servidor.
                </p>
                {localUrl && (
                  <p className="mt-1 truncate text-[10px] font-bold text-ink/40">
                    {localUrl}
                  </p>
                )}
              </div>

              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={handleProcessLocal}
                  className="brutal-btn-primary h-10 flex-1 px-3 text-[10px] uppercase tracking-wide sm:flex-none"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  Processar na minha máquina
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocalSettingsOpen((open) => !open);
                    setLocalError(null);
                  }}
                  className="brutal-btn-ghost h-10 px-3 text-[10px] uppercase tracking-wide"
                >
                  {localSettingsOpen ? "Fechar" : "Configurar"}
                </button>
              </div>
            </div>

            {localSettingsOpen && (
              <div className="mt-3 border-t-[3px] border-dashed border-ink/20 pt-3">
                <label
                  htmlFor="local-url"
                  className="text-[10px] font-bold uppercase tracking-[0.1em] text-mute"
                >
                  Endereço do app no seu computador
                </label>

                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="local-url"
                    value={localUrlDraft}
                    onChange={(event) => {
                      setLocalUrlDraft(event.target.value);
                      if (localError) setLocalError(null);
                    }}
                    placeholder="http://localhost:3000"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 min-w-0 flex-1 rounded-lg border-[3px] border-ink bg-cream px-3 text-xs font-medium text-ink outline-none placeholder:text-mute/60"
                  />
                  <button
                    type="button"
                    onClick={saveLocalUrl}
                    className="brutal-btn-primary h-10 px-3 text-[10px] uppercase tracking-wide"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                    Salvar
                  </button>
                </div>

                {localError && (
                  <p className="mt-1.5 text-[11px] font-bold leading-snug text-tomato">
                    {localError}
                  </p>
                )}

                <div className="mt-2 space-y-1 text-[10.5px] font-medium leading-relaxed text-mute">
                  <p>
                    <strong className="text-ink">Computador:</strong>{" "}
                    <code>http://localhost:3000</code> com <code>npm run dev</code>{" "}
                    rodando.
                  </p>
                  <p>
                    <strong className="text-ink">Celular:</strong> use o IP do Mac
                    na mesma Wi-Fi ou rode <code>npm run share</code> e cole a URL{" "}
                    <code>https://…trycloudflare.com</code>.
                  </p>
                  <p className="text-ink/45">
                    Trate a URL do túnel como uma senha. O Mac precisa estar ligado.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        <div
          aria-hidden
          className="film-strip mx-auto mt-8 h-[10px] w-48 rounded-full"
        />

        {error && (
          <div
            role="alert"
            className="brutal-card mx-auto mt-6 flex w-full max-w-2xl flex-wrap items-start gap-2.5 bg-tomato p-3.5 text-sm font-bold leading-relaxed text-ink"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-[12rem] flex-1">{error}</p>
            {!serverLocal && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  handleProcessLocal();
                }}
                className="shrink-0 rounded-lg border-[3px] border-ink bg-yellow px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide shadow-brutal-sm transition hover:-translate-y-0.5"
              >
                Na minha máquina
              </button>
            )}
            <button
              type="button"
              onClick={() => setError(null)}
              className="brutal-icon-btn h-6 w-6 shrink-0"
              aria-label="Fechar erro"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>
        )}

        {loading && !video && (
          <section className="brutal-card mx-auto mt-8 w-full max-w-2xl p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
              <div className="skeleton aspect-video rounded-xl sm:aspect-auto sm:min-h-[150px]" />
              <div className="space-y-3 py-2">
                <div className="skeleton h-3 w-20 rounded-full" />
                <div className="skeleton h-4 w-full rounded-full" />
                <div className="skeleton h-4 w-2/3 rounded-full" />
                <div className="skeleton h-3 w-40 rounded-full" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <div className="skeleton h-16 rounded-xl" />
              <div className="skeleton h-16 rounded-xl" />
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
          <div className="mx-auto mt-12 grid max-w-2xl gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="brutal-card p-4 transition-[transform,box-shadow] duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`grid h-9 w-9 place-items-center rounded-lg border-[3px] border-ink text-ink shadow-brutal-sm ${step.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="rounded-full border-2 border-ink bg-cream px-2 py-0.5 font-display text-[10px]">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-bold">{step.title}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-mute">
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
              <h2 className="flex items-center gap-1.5 font-display text-lg uppercase">
                <HistoryIcon className="h-4 w-4" />
                Recentes
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="brutal-btn-ghost px-2.5 py-1 text-[10px] uppercase tracking-wide"
              >
                <TrashIcon className="h-3 w-3" />
                Limpar
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {history.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => void analyze(item.url)}
                  className="brutal-card group flex items-center gap-3 p-2 text-left transition-[transform,box-shadow] duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg"
                >
                  <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border-[3px] border-ink bg-blue/30">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-ink/40">
                        <FilmIcon className="h-4 w-4" />
                      </div>
                    )}
                    {item.duration ? (
                      <span className="absolute bottom-1 right-1 rounded border-2 border-ink bg-ink px-1 py-0.5 text-[9px] font-bold tabular-nums text-cream">
                        {formatDuration(item.duration)}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-bold leading-snug">
                      {item.title}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-mute">
                      {item.domain}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-auto">
        <div aria-hidden className="film-strip h-[10px] w-full" />
        <div className="mx-auto w-full max-w-4xl px-5 py-6 text-center text-[11px] font-medium leading-relaxed text-mute">
          <p>
            Use apenas para conteúdo que você tem direito de baixar. O app não
            hospeda arquivos: tudo é processado localmente no seu computador.
          </p>
          <p className="mt-1.5 font-bold uppercase tracking-[0.12em] text-ink/50">
            yt-dlp + ffmpeg · sem login · sem rastreamento
          </p>
        </div>
      </footer>

      {jobs.length > 0 && (
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-stretch gap-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[380px]">
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
