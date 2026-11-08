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
const isVercel = Boolean(process.env.VERCEL);
const binDir = join(root, "bin");
const wrapper = join(binDir, isWindows ? "yt-dlp.exe" : "yt-dlp");
const zipapp = join(binDir, "yt-dlp.pyz");
const venvDir = join(root, "node_modules", ".cache", "pega-video", "venv");
const venvPython = isWindows
  ? join(venvDir, "Scripts", "python.exe")
  : join(venvDir, "bin", "python");
const python = process.env.YTDLP_PYTHON || "python3";
const force =
  process.argv.includes("--force") || process.env.YTDLP_FORCE_UPDATE === "1";

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

function hasModule(pythonBinary, module) {
  try {
    execFileSync(pythonBinary, ["-c", `import ${module}`], {
      stdio: "ignore",
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
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
PY="$DIR/../node_modules/.cache/pega-video/venv/bin/python"
if [ ! -x "$PY" ]; then
  PY=python3
fi
exec "$PY" "$DIR/yt-dlp.pyz" "$@"
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

function ensureVenv() {
  if (isWindows || isVercel) return false;

  const pyVersion = pythonVersion();
  if (!pyVersion) {
    console.warn(
      "Aviso: Python 3 não encontrado. O yt-dlp vai usar o binário standalone; TikTok e Instagram podem falhar.",
    );
    return false;
  }

  try {
    if (!existsSync(venvPython)) {
      console.log("Criando ambiente Python local…");
      mkdirSync(dirname(venvDir), { recursive: true });
      execFileSync(python, ["-m", "venv", "--copies", venvDir], {
        stdio: "ignore",
      });
    }

    if (!existsSync(venvPython)) {
      throw new Error("não foi possível criar a venv");
    }

    if (!hasModule(venvPython, "curl_cffi")) {
      console.log(
        "Instalando curl_cffi (necessário para TikTok/Instagram)…",
      );
      execFileSync(
        venvPython,
        [
          "-m",
          "pip",
          "install",
          "--quiet",
          "--disable-pip-version-check",
          "--upgrade",
          "curl_cffi",
        ],
        { stdio: "inherit" },
      );
    }

    return hasModule(venvPython, "curl_cffi");
  } catch (error) {
    console.warn(
      `Aviso: não foi possível preparar o curl_cffi (${
        error instanceof Error ? error.message : error
      }). TikTok/Instagram podem exigir cookies.`,
    );
    return false;
  }
}

if (process.env.YTDLP_SKIP_DOWNLOAD === "1") {
  console.log("Instalação do yt-dlp ignorada (YTDLP_SKIP_DOWNLOAD=1).");
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });

// Versões antigas criavam a venv em bin/venv; symlinks externos quebravam o Turbopack.
rmSync(join(binDir, "venv"), { recursive: true, force: true });

if (!isWindows && !isVercel) {
  ensureVenv();

  if (force || !existsSync(zipapp)) {
    console.log("Baixando o pacote oficial do yt-dlp…");
    try {
      await download(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
        zipapp,
      );
    } catch (error) {
      console.warn(
        `Não foi possível baixar o yt-dlp: ${
          error instanceof Error ? error.message : error
        }`,
      );
      rmSync(zipapp, { force: true });
    }
  }

  if (existsSync(zipapp)) {
    writeWrapper();
    const version = versionOf(wrapper);
    if (version) {
      console.log(`yt-dlp local pronto (${version}).`);
      checkFfmpeg();
      process.exit(0);
    }
  }
}

if (!isVercel) {
  const systemVersion = force ? null : versionOf("yt-dlp");
  if (systemVersion) {
    if (!existsSync(zipapp)) rmSync(wrapper, { force: true });
    console.log(
      `yt-dlp do sistema encontrado (${systemVersion}). Usando o binário global.`,
    );
    checkFfmpeg();
    process.exit(0);
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
