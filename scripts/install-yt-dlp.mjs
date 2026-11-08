import { execFileSync } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const binDir = join(root, "bin");
const wrapper = join(binDir, "yt-dlp");
const zipapp = join(binDir, "yt-dlp.pyz");
const python = process.env.YTDLP_PYTHON || "python3";
const force =
  process.argv.includes("--force") || process.env.YTDLP_FORCE_UPDATE === "1";
const isVercel = Boolean(process.env.VERCEL);

function versionOf(binary) {
  try {
    return execFileSync(binary, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
    }).trim();
  } catch {
    return null;
  }
}

function pythonVersion() {
  try {
    return execFileSync(
      python,
      [
        "-c",
        "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

function checkFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    console.warn(
      "Aviso: ffmpeg não encontrado. Ele é necessário para mesclar vídeo + áudio e converter para MP3.",
    );
    console.warn("Instale com `brew install ffmpeg`.\n");
  }
}

function writeWrapper() {
  const script = `#!/bin/sh
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -z "$SSL_CERT_FILE" ]; then
  if [ -f /etc/ssl/cert.pem ]; then
    export SSL_CERT_FILE=/etc/ssl/cert.pem
  elif [ -f /etc/ssl/certs/ca-certificates.crt ]; then
    export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
  fi
fi
exec ${python} "$DIR/yt-dlp.pyz" "$@"
`;

  writeFileSync(wrapper, script, { mode: 0o755 });
  chmodSync(wrapper, 0o755);
}

async function download(url, target) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

if (process.env.YTDLP_SKIP_DOWNLOAD === "1") {
  console.log("Instalação do yt-dlp ignorada (YTDLP_SKIP_DOWNLOAD=1).");
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });

if (!isWindows && !isVercel && !force && existsSync(zipapp) && existsSync(wrapper)) {
  const version = versionOf(wrapper);
  if (version) {
    console.log(`yt-dlp local pronto (${version}).`);
    checkFfmpeg();
    process.exit(0);
  }
}

const systemVersion = force ? null : versionOf("yt-dlp");
if (systemVersion) {
  console.log(
    `yt-dlp do sistema encontrado (${systemVersion}). Usando o binário global.`,
  );
  checkFfmpeg();
  process.exit(0);
}

if (!isWindows && !isVercel) {
  const pyVersion = pythonVersion();

  if (pyVersion) {
    console.log(
      `Usando Python ${pyVersion} com o pacote oficial do yt-dlp (inicialização rápida)…`,
    );

    try {
      await download(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
        zipapp,
      );
      writeWrapper();

      const version = versionOf(wrapper);
      if (version) {
        console.log(`yt-dlp instalado em bin/yt-dlp (${version}).`);
        checkFfmpeg();
        process.exit(0);
      }
    } catch (error) {
      console.warn(
        `Não foi possível preparar o yt-dlp via Python: ${
          error instanceof Error ? error.message : error
        }`,
      );
      rmSync(zipapp, { force: true });
      rmSync(wrapper, { force: true });
    }
  }
}

const asset = isWindows
  ? "yt-dlp.exe"
  : process.platform === "darwin"
    ? "yt-dlp_macos"
    : process.arch === "arm64"
      ? "yt-dlp_linux_aarch64"
      : "yt-dlp_linux";

const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;

console.log(`Baixando o binário do yt-dlp (${asset})…`);

try {
  await download(url, wrapper);
  if (!isWindows) chmodSync(wrapper, 0o755);

  const version = versionOf(wrapper);
  if (!version) throw new Error("o binário baixado não executou");

  console.log(`yt-dlp instalado em bin/yt-dlp (${version}).`);
} catch (error) {
  console.warn(
    `\nNão foi possível baixar o yt-dlp automaticamente: ${
      error instanceof Error ? error.message : error
    }`,
  );
  console.warn(
    "Instale com `brew install yt-dlp` e rode `npm run setup` novamente.\n",
  );
}

checkFfmpeg();
