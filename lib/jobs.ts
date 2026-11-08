import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AppError } from "@/lib/errors";
import type { JobStatus, JobView, OptionKind } from "@/lib/types";
import {
  cookieArgs,
  ffmpegHint,
  friendlyError,
  sanitizeFilename,
  ytdlpBinary,
} from "@/lib/ytdlp";

interface Job extends JobView {
  dir: string;
  filePath: string | null;
  proc: ChildProcess | null;
  canceled: boolean;
}

interface Store {
  jobs: Map<string, Job>;
  root: string;
}

export interface CreateJobInput {
  url: string;
  selector: string;
  kind: OptionKind;
  mergeExt: string | null;
  title: string;
  label: string | null;
}

const globalForJobs = globalThis as typeof globalThis & {
  __pegaVideoStore?: Store;
};

const ACTIVE_STATUSES: JobStatus[] = ["preparing", "downloading", "processing"];
const MAX_ACTIVE_JOBS = 3;
const READY_TTL_MS = 30 * 60_000;
const MAX_JOB_AGE_MS = 2 * 60 * 60_000;

function getStore(): Store {
  if (!globalForJobs.__pegaVideoStore) {
    const store: Store = {
      jobs: new Map(),
      root: path.join(os.tmpdir(), "pega-video"),
    };
    fs.mkdirSync(store.root, { recursive: true });
    globalForJobs.__pegaVideoStore = store;

    const timer = setInterval(() => {
      void sweep(store);
    }, 5 * 60_000);
    timer.unref?.();

    void sweep(store);
  }

  return globalForJobs.__pegaVideoStore;
}

function isActive(job: Job): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

function toView(job: Job): JobView {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    title: job.title,
    label: job.label,
    kind: job.kind,
    selector: job.selector,
    filename: job.filename,
    size: job.size,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function progressField(value: string): string | null {
  const clean = value.trim();
  if (!clean || /^(unknown|n\/a|na)\b/i.test(clean)) return null;
  return clean;
}

function handleLine(job: Job, line: string): void {
  const progress = line.match(/PROGRESS\s+([\d.]+)%\|([^|]*)\|(.*)$/);

  if (progress) {
    const percent = Number(progress[1]);
    if (Number.isFinite(percent)) {
      job.progress = Math.max(job.progress, Math.min(99, percent));
    }

    job.speed = progressField(progress[2]);
    job.eta = progressField(progress[3]);

    if (job.status === "preparing") job.status = "downloading";
    job.updatedAt = Date.now();
    return;
  }

  if (
    /\[Merger\]|\[ExtractAudio\]|\[VideoConvertor\]|\[VideoRemuxer\]|\[FixupM3u8\]/i.test(
      line,
    )
  ) {
    job.status = "processing";
    job.progress = Math.max(job.progress, 99);
    job.speed = null;
    job.eta = null;
    job.updatedAt = Date.now();
  }
}

async function finalizeJob(job: Job): Promise<void> {
  const entries = await fs.promises.readdir(job.dir, { withFileTypes: true });
  const files: Array<{ path: string; size: number }> = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith(".") || entry.name.endsWith(".part")) continue;
    const fullPath = path.join(job.dir, entry.name);
    const stat = await fs.promises.stat(fullPath).catch(() => null);
    if (stat && stat.size > 0) files.push({ path: fullPath, size: stat.size });
  }

  if (!files.length) {
    throw new AppError("O download terminou, mas nenhum arquivo foi encontrado.", 500);
  }

  files.sort((a, b) => b.size - a.size);
  const source = files[0];
  const ext = path.extname(source.path).slice(1).toLowerCase() || "mp4";
  const base = sanitizeFilename(
    `${job.title}${job.label ? ` [${job.label}]` : ""}`,
  );
  const filename = `${base}.${ext}`;
  const finalPath = path.join(job.dir, filename);

  if (source.path !== finalPath) {
    await fs.promises.rename(source.path, finalPath);
  }

  for (const entry of await fs.promises.readdir(job.dir, { withFileTypes: true })) {
    if (entry.name === filename) continue;
    await fs.promises.rm(path.join(job.dir, entry.name), {
      recursive: true,
      force: true,
    });
  }

  const stat = await fs.promises.stat(finalPath);

  job.filePath = finalPath;
  job.filename = filename;
  job.size = stat.size;
  job.status = "ready";
  job.progress = 100;
  job.speed = null;
  job.eta = null;
  job.error = null;
  job.updatedAt = Date.now();
}

async function failJob(job: Job, message: string): Promise<void> {
  job.status = "error";
  job.error = message;
  job.speed = null;
  job.eta = null;
  job.updatedAt = Date.now();
  job.filePath = null;
  await fs.promises.rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

function startJob(job: Job, input: CreateJobInput): void {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "--no-colors",
    "--socket-timeout",
    "20",
    "--retries",
    "3",
    "--fragment-retries",
    "5",
    "--progress-template",
    "download:PROGRESS %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
    "-o",
    path.join(job.dir, "media.%(ext)s"),
    "-f",
    job.selector,
    ...cookieArgs(),
  ];

  if (input.kind === "mp3") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else if (input.kind === "video" && input.mergeExt) {
    args.push("--merge-output-format", input.mergeExt);
  }

  const ffmpeg = ffmpegHint();
  if (ffmpeg) args.push("--ffmpeg-location", ffmpeg);

  args.push(input.url);

  const child = spawn(/* turbopackIgnore: true */ ytdlpBinary(), args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });

  job.proc = child;
  let stderr = "";
  let buffer = "";
  let settled = false;

  const consume = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(job, line);
  };

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => consume(chunk));

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
    consume(chunk);
  });

  child.on("error", (error) => {
    if (settled) return;
    settled = true;
    job.proc = null;
    const message = error.message.includes("ENOENT")
      ? "O yt-dlp não está instalado. Rode `npm run setup`."
      : `Falha ao iniciar o download: ${error.message}`;
    void failJob(job, message);
  });

  child.on("close", (code) => {
    if (settled) return;
    settled = true;
    job.proc = null;

    if (job.canceled) {
      void fs.promises
        .rm(job.dir, { recursive: true, force: true })
        .catch(() => {});
      return;
    }

    if (code !== 0) {
      void failJob(job, friendlyError(stderr));
      return;
    }

    void finalizeJob(job).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Falha ao preparar o arquivo final.";
      void failJob(job, message);
    });
  });
}

export async function createJob(input: CreateJobInput): Promise<JobView> {
  const store = getStore();

  const activeJobs = [...store.jobs.values()].filter(isActive).length;
  if (activeJobs >= MAX_ACTIVE_JOBS) {
    throw new AppError(
      "Você já tem 3 downloads em andamento. Espere um terminar para começar outro.",
      429,
    );
  }

  const id = randomUUID();
  const dir = await fs.promises.mkdtemp(path.join(store.root, "job-"));

  const selector =
    input.kind === "best"
      ? "bv*+ba/b"
      : input.kind === "mp3"
        ? "bestaudio/best"
        : input.selector;

  const job: Job = {
    id,
    status: "preparing",
    progress: 0,
    speed: null,
    eta: null,
    title: input.title,
    label: input.label,
    kind: input.kind,
    selector,
    filename: null,
    size: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dir,
    filePath: null,
    proc: null,
    canceled: false,
  };

  store.jobs.set(id, job);
  startJob(job, input);

  return toView(job);
}

export function getJob(id: string): JobView | null {
  const job = getStore().jobs.get(id);
  return job ? toView(job) : null;
}

export function getJobFile(
  id: string,
): { filePath: string; filename: string; size: number } | null {
  const job = getStore().jobs.get(id);
  if (!job || job.status !== "ready" || !job.filePath || !job.filename) return null;
  return { filePath: job.filePath, filename: job.filename, size: job.size ?? 0 };
}

export function listJobs(): JobView[] {
  return [...getStore().jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 25)
    .map(toView);
}

export async function cancelJob(id: string): Promise<boolean> {
  const job = getStore().jobs.get(id);
  if (!job) return false;

  job.canceled = true;
  job.proc?.kill("SIGKILL");
  job.status = "canceled";
  job.speed = null;
  job.eta = null;
  job.error = null;
  job.filePath = null;
  job.updatedAt = Date.now();

  await fs.promises.rm(job.dir, { recursive: true, force: true }).catch(() => {});
  return true;
}

async function sweep(store: Store): Promise<void> {
  const now = Date.now();

  for (const [id, job] of store.jobs) {
    if (isActive(job) && now - job.createdAt > MAX_JOB_AGE_MS) {
      job.canceled = true;
      job.proc?.kill("SIGKILL");
      job.status = "error";
      job.error = "O download expirou. Tente novamente.";
      job.updatedAt = now;
      continue;
    }

    if (!isActive(job) && now - job.updatedAt > READY_TTL_MS) {
      store.jobs.delete(id);
      await fs.promises
        .rm(job.dir, { recursive: true, force: true })
        .catch(() => {});
    }
  }

  const knownDirs = new Set(
    [...store.jobs.values()].map((job) => job.dir),
  );

  const entries = await fs.promises
    .readdir(store.root, { withFileTypes: true })
    .catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(store.root, entry.name);
    if (knownDirs.has(fullPath)) continue;

    const stat = await fs.promises.stat(fullPath).catch(() => null);
    if (stat && now - stat.mtimeMs > MAX_JOB_AGE_MS) {
      await fs.promises
        .rm(fullPath, { recursive: true, force: true })
        .catch(() => {});
    }
  }
}
