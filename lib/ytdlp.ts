import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { AppError } from "@/lib/errors";
import type { FormatOption, ResolvedVideo } from "@/lib/types";

const PROJECT_ROOT = process.cwd();
const LOCAL_BINARY = path.join(
  PROJECT_ROOT,
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);

export interface YtDlpFormat {
  format_id?: string;
  ext?: string;
  url?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  fps?: number;
  tbr?: number;
  abr?: number;
  filesize?: number;
  filesize_approx?: number;
  resolution?: string;
  format_note?: string;
  protocol?: string;
}

export interface YtDlpInfo {
  _type?: string;
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  uploader_id?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
  extractor?: string;
  extractor_key?: string;
  webpage_url?: string;
  original_url?: string;
  view_count?: number;
  upload_date?: string;
  is_live?: boolean;
  formats?: YtDlpFormat[];
  entries?: unknown[];
}

interface RunOptions {
  onLine?: (line: string) => void;
  timeoutMs?: number;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

export function ytdlpBinary(): string {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  if (fs.existsSync(LOCAL_BINARY)) return LOCAL_BINARY;
  return "yt-dlp";
}

export function ffmpegHint(): string | undefined {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return undefined;
}

export function cookieArgs(): string[] {
  const file = process.env.YTDLP_COOKIE_FILE;
  if (file && fs.existsSync(file)) return ["--cookies", file];

  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER;
  if (browser) return ["--cookies-from-browser", browser];

  return [];
}

export function normalizeInputUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError("Envie um link válido.", 400);
  }

  let raw = value.trim();
  if (!raw) throw new AppError("Cole um link para analisar.", 400);
  if (raw.length > 2048) throw new AppError("Esse link é longo demais.", 400);

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError("Esse link não parece válido.", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("Só é possível analisar links http ou https.", 400);
  }

  return parsed.toString();
}

export function sanitizeFilename(value: string, maxLength = 120): string {
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[/\\?%*:|"<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "video";

  let result = "";
  for (const char of clean) {
    if (result.length >= maxLength) break;
    if (Buffer.byteLength(result + char) > 180) break;
    result += char;
  }

  return result.trim() || "video";
}

export function isSafeSelector(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    !value.startsWith("-") &&
    /^[A-Za-z0-9._+*[\]\]=:,\/-]+$/.test(value)
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

export function friendlyError(raw: string): string {
  const clean = stripAnsi(raw);
  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const errorLine =
    [...lines].reverse().find((line) => /^ERROR:/i.test(line)) ??
    lines[lines.length - 1] ??
    "";
  const message = errorLine.replace(/^ERROR:\s*/i, "").split(";")[0].trim();
  const lower = message.toLowerCase();

  const mappings: Array<[RegExp, string]> = [
    [
      /sign in to confirm|not a bot|confirm you.?re not a bot|login required|requires authentication|cookies/i,
      "O site pediu verificação ou login. Tente outro link ou configure os cookies do navegador (veja o README).",
    ],
    [/private video|is private/i, "Este vídeo é privado."],
    [/confirm your age|age-restricted|inappropriate for some users/i, "Este conteúdo tem restrição de idade e precisa de login."],
    [
      /video unavailable|not available in your country|this video is unavailable|has been removed/i,
      "Vídeo indisponível, removido ou bloqueado na sua região.",
    ],
    [/playlist/i, "Esse link é uma playlist. Envie o link de um vídeo específico."],
    [
      /unable to download webpage|failed to resolve|getaddrinfo|timed out|timeout|connection/i,
      "Não foi possível acessar o link. Verifique a URL e sua conexão.",
    ],
    [
      /no video formats found|requested format is not available|no formats found/i,
      "Nenhum formato de vídeo foi encontrado nesse link.",
    ],
    [/unsupported url|no suitable extractor/i, "Esse link ainda não é suportado."],
    [
      /enoent|python3?: (command )?not found|exec: .*not found/i,
      "O yt-dlp não está disponível neste servidor.",
    ],
    [/http error 404|404 not found/i, "Conteúdo não encontrado (404)."],
  ];

  for (const [pattern, friendly] of mappings) {
    if (pattern.test(lower)) return friendly;
  }

  if (message) {
    return `Não foi possível processar o link: ${message.slice(0, 220)}`;
  }

  return "Não foi possível processar o link.";
}

export function runYtdlp(args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ ytdlpBinary(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";
    let outBuffer = "";
    let errBuffer = "";
    let settled = false;
    let timedOut = false;

    const onLine = options.onLine;

    const flushLines = (buffer: string) => {
      const parts = buffer.split(/\r?\n/);
      const rest = parts.pop() ?? "";
      for (const line of parts) {
        if (line.trim()) onLine?.(line);
      }
      return rest;
    };

    const timer = setTimeout(() => {
      if (!settled) {
        timedOut = true;
        child.kill("SIGKILL");
      }
    }, options.timeoutMs ?? 120_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      outBuffer += chunk;
      outBuffer = flushLines(outBuffer);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      errBuffer += chunk;
      errBuffer = flushLines(errBuffer);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error.message.includes("ENOENT")) {
        reject(
          new AppError(
            "O yt-dlp não está instalado. Rode `npm run setup` na pasta do projeto.",
            500,
          ),
        );
        return;
      }
      reject(new AppError(`Falha ao executar o yt-dlp: ${error.message}`, 500));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        reject(new AppError("O site demorou demais para responder. Tente novamente.", 504));
        return;
      }

      if (code !== 0) {
        if (process.env.VERCEL) {
          console.error("[yt-dlp]", stderr.slice(-2000));
        }
        reject(new AppError(friendlyError(stderr || stdout), 422));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function realCodec(codec: string | undefined): string | null {
  if (!codec || codec === "none") return null;
  return codec;
}

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "m4v",
  "webm",
  "mkv",
  "mov",
  "avi",
  "flv",
  "3gp",
]);

const AUDIO_EXTENSIONS = new Set([
  "m4a",
  "mp3",
  "opus",
  "ogg",
  "oga",
  "wav",
  "flac",
  "aac",
]);

function classifyFormat(
  format: YtDlpFormat,
): "combined" | "video" | "audio" | "skip" {
  const video = realCodec(format.vcodec);
  const audio = realCodec(format.acodec);

  if (video && audio) return "combined";
  if (video) return "video";
  if (audio) return "audio";

  const ext = (format.ext ?? "").toLowerCase();
  const hint = `${format.resolution ?? ""} ${format.format_note ?? ""}`.toLowerCase();

  if (hint.includes("audio only")) {
    return AUDIO_EXTENSIONS.has(ext) ? "audio" : "skip";
  }

  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (VIDEO_EXTENSIONS.has(ext)) return "combined";

  return "skip";
}

function prettyVideoCodec(codec: string | null): string | null {
  if (!codec) return null;
  if (/^(avc|h\.?264)/i.test(codec)) return "H.264";
  if (/^(hev|hvc|h\.?265)/i.test(codec)) return "HEVC";
  if (/^av01/i.test(codec)) return "AV1";
  if (/^vp0?9/i.test(codec)) return "VP9";
  if (/^vp0?8/i.test(codec)) return "VP8";
  return codec.split(".")[0].toUpperCase();
}

function prettyAudioCodec(codec: string | null): string | null {
  if (!codec) return null;
  if (/^mp4a|^aac/i.test(codec)) return "AAC";
  if (/^opus/i.test(codec)) return "Opus";
  if (/^mp3/i.test(codec)) return "MP3";
  if (/^vorbis/i.test(codec)) return "Vorbis";
  if (/^ac-?3/i.test(codec)) return "AC-3";
  if (/^ec-?3/i.test(codec)) return "E-AC-3";
  return codec.split(".")[0].toUpperCase();
}

function sizeOf(format: YtDlpFormat): number | null {
  const value = format.filesize ?? format.filesize_approx;
  return typeof value === "number" && value > 0 ? value : null;
}

function isStoryboard(format: YtDlpFormat): boolean {
  const note = String(format.format_note ?? "").toLowerCase();
  return (
    note.includes("storyboard") ||
    format.ext === "mhtml" ||
    format.protocol === "mhtml"
  );
}

function resolutionLabel(format: YtDlpFormat): string {
  const height = format.height && format.height > 0 ? Math.round(format.height) : null;
  const fps = format.fps && format.fps > 30 ? Math.round(format.fps) : null;

  if (height) return `${height}p${fps ? `${fps}` : ""}`;

  const fallback = String(format.resolution ?? "").trim();
  if (fallback) return fallback.replace(/\s+/g, " ");

  return "Vídeo";
}

function audioSortValue(format: YtDlpFormat): number {
  return (format.abr ?? format.tbr ?? 0) * 1_000 + (format.filesize ?? 0) / 1_000;
}

interface VideoCandidate {
  option: FormatOption;
  height: number;
  fps: number;
  realNote: number;
  mp4: number;
  combined: number;
  knownSize: number;
  tbr: number;
}

export function buildVideoOptions(
  formats: YtDlpFormat[],
  bestHeight: number | null,
): FormatOption[] {
  const bestAudioSize = formats
    .filter((format) => classifyFormat(format) === "audio")
    .map(sizeOf)
    .filter((size): size is number => size !== null)
    .reduce<number | null>(
      (max, size) => (max === null || size > max ? size : max),
      null,
    );

  const bestVideoSize = formats
    .filter((format) => {
      const kind = classifyFormat(format);
      return kind === "video" || kind === "combined";
    })
    .map(sizeOf)
    .filter((size): size is number => size !== null)
    .reduce<number | null>(
      (max, size) => (max === null || size > max ? size : max),
      null,
    );

  const options: FormatOption[] = [
    {
      selector: "bv*+ba/b",
      kind: "best",
      label: "Melhor",
      ext: null,
      height: bestHeight,
      fps: null,
      vcodec: null,
      acodec: null,
      filesize:
        bestVideoSize !== null ? bestVideoSize + (bestAudioSize ?? 0) : null,
      note: "Melhor vídeo + melhor áudio disponíveis",
      recommended: true,
    },
  ];

  const candidates: VideoCandidate[] = [];

  for (const format of formats) {
    const kind = classifyFormat(format);
    if (kind !== "combined" && kind !== "video") continue;

    const height =
      format.height && format.height > 0 ? Math.round(format.height) : null;
    const fps = format.fps ? Math.round(format.fps) : null;
    const ext = format.ext ?? "mp4";
    const ownSize = sizeOf(format);
    const isVideoOnly = kind === "video";
    const hint =
      `${format.resolution ?? ""} ${format.format_note ?? ""}`.toLowerCase();
    const realNote = /\d{2,4}x\d{2,4}|\d{3,4}p/.test(hint) ? 1 : 0;

    const option: FormatOption = {
      selector: isVideoOnly
        ? `${format.format_id}+bestaudio[ext=m4a]/${format.format_id}+bestaudio/${format.format_id}`
        : String(format.format_id),
      kind: "video",
      label: resolutionLabel(format),
      ext: isVideoOnly
        ? ext === "mp4"
          ? "mp4"
          : ext === "webm"
            ? "webm"
            : "mkv"
        : ext,
      height,
      fps,
      vcodec: prettyVideoCodec(realCodec(format.vcodec)),
      acodec: prettyAudioCodec(realCodec(format.acodec)) ??
        (isVideoOnly ? "AAC" : null),
      filesize: isVideoOnly
        ? ownSize !== null
          ? ownSize + (bestAudioSize ?? 0)
          : null
        : ownSize,
      note: isVideoOnly ? "Áudio mesclado automaticamente" : null,
    };

    candidates.push({
      option,
      height: height ?? 0,
      fps: fps ?? 0,
      realNote,
      mp4: ext === "mp4" ? 1 : 0,
      combined: isVideoOnly ? 0 : 1,
      knownSize: ownSize !== null ? 1 : 0,
      tbr: format.tbr ?? 0,
    });
  }

  candidates.sort(
    (a, b) =>
      b.height - a.height ||
      b.fps - a.fps ||
      b.realNote - a.realNote ||
      b.mp4 - a.mp4 ||
      b.combined - a.combined ||
      b.knownSize - a.knownSize ||
      b.tbr - a.tbr,
  );

  const seen = new Set<string>();

  for (const candidate of candidates) {
    const { option } = candidate;
    const key =
      candidate.height > 0
        ? `${candidate.height}-${candidate.fps}`
        : `${option.label}-${option.ext}`;

    if (seen.has(key)) continue;
    seen.add(key);

    options.push(option);
    if (options.length >= 9) break;
  }

  return options;
}

export function buildAudioOptions(formats: YtDlpFormat[]): FormatOption[] {
  const options: FormatOption[] = [
    {
      selector: "bestaudio/best",
      kind: "mp3",
      label: "MP3",
      ext: "mp3",
      height: null,
      fps: null,
      vcodec: null,
      acodec: "MP3",
      filesize: null,
      note: "Convertido da melhor faixa de áudio",
    },
  ];

  const audioOnly = formats
    .filter((format) => classifyFormat(format) === "audio")
    .sort((a, b) => audioSortValue(b) - audioSortValue(a));

  const seen = new Set<string>();
  for (const format of audioOnly) {
    const bitrate = Math.round(format.abr ?? format.tbr ?? 0);
    const key = `${format.ext}-${Math.round(bitrate / 24)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      selector: String(format.format_id),
      kind: "audio",
      label: bitrate > 0 ? `${bitrate} kbps` : "Áudio original",
      ext: format.ext ?? "m4a",
      height: null,
      fps: null,
      vcodec: null,
      acodec: prettyAudioCodec(realCodec(format.acodec)),
      filesize: sizeOf(format),
      note: null,
    });
    if (options.length >= 7) break;
  }

  return options;
}

export async function resolveVideo(url: string): Promise<ResolvedVideo> {
  const { stdout } = await runYtdlp(
    [
      "-J",
      "--no-playlist",
      "--no-warnings",
      "--no-check-formats",
      "--socket-timeout",
      "20",
      "--retries",
      "2",
      ...cookieArgs(),
      url,
    ],
    { timeoutMs: 90_000 },
  );

  let info: YtDlpInfo;
  try {
    info = JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new AppError("O extrator devolveu uma resposta inesperada. Tente novamente.", 502);
  }

  if (!info || typeof info !== "object") {
    throw new AppError("Não foi possível ler as informações desse link.", 422);
  }

  if (info._type === "playlist" || Array.isArray(info.entries)) {
    throw new AppError(
      "Esse link é uma playlist. Envie o link de um vídeo específico.",
      422,
    );
  }

  const formats = Array.isArray(info.formats) ? info.formats : [];
  const usable = formats.filter((format) => {
    if (!format || !format.url || !format.format_id) return false;
    if (isStoryboard(format)) return false;
    return true;
  });

  const heights = usable
    .map((format) => format.height ?? 0)
    .filter((height) => height > 0);
  const bestHeight = heights.length ? Math.round(Math.max(...heights)) : null;

  const pageUrl =
    typeof info.webpage_url === "string"
      ? info.webpage_url
      : typeof info.original_url === "string"
        ? info.original_url
        : url;

  let domain = "";
  try {
    domain = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    domain = "";
  }

  const thumbnails = Array.isArray(info.thumbnails) ? info.thumbnails : [];
  const thumbCandidate =
    (typeof info.thumbnail === "string" && info.thumbnail) ||
    thumbnails.map((thumb) => thumb?.url).find((value) => typeof value === "string") ||
    null;
  const thumbnail =
    thumbCandidate && /^https?:\/\//i.test(thumbCandidate) ? thumbCandidate : null;

  return {
    url: pageUrl,
    title:
      typeof info.title === "string" && info.title.trim()
        ? info.title.trim()
        : "Vídeo sem título",
    uploader:
      typeof info.uploader === "string"
        ? info.uploader
        : typeof info.channel === "string"
          ? info.channel
          : null,
    duration:
      typeof info.duration === "number" && info.duration > 0
        ? Math.round(info.duration)
        : null,
    thumbnail,
    extractor:
      (typeof info.extractor_key === "string" && info.extractor_key) ||
      (typeof info.extractor === "string" && info.extractor) ||
      domain ||
      "link",
    domain: domain || "link",
    viewCount:
      typeof info.view_count === "number" && info.view_count >= 0
        ? info.view_count
        : null,
    uploadDate: typeof info.upload_date === "string" ? info.upload_date : null,
    isLive: info.is_live === true,
    videoOptions: buildVideoOptions(usable, bestHeight),
    audioOptions: buildAudioOptions(usable),
  };
}
