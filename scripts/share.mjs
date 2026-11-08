import { execFileSync, spawn } from "node:child_process";

const SITE_URL = process.env.PEGA_SITE_URL || "https://pegavideo.vercel.app";

function hasCloudflared() {
  try {
    execFileSync("cloudflared", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hasCloudflared()) {
  console.error("cloudflared não encontrado.");
  console.error("Instale com: brew install cloudflared");
  process.exit(1);
}

try {
  const response = await fetch("http://localhost:3000/api/health", {
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error("health check falhou");
} catch {
  console.warn(
    "Aviso: o app não respondeu em http://localhost:3000. Rode `npm run dev` em outro terminal.",
  );
}

console.log("\nAbrindo túnel para http://localhost:3000 …");
console.log("Aguarde a URL https://….trycloudflare.com aparecer.\n");

const child = spawn("cloudflared", ["tunnel", "--url", "http://localhost:3000"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let buffer = "";
let printed = false;

function handleOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);

  buffer = (buffer + text).slice(-8000);
  if (printed) return;

  const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match) return;

  printed = true;
  const tunnelUrl = match[0];
  const pairingUrl = `${SITE_URL}/?local=${encodeURIComponent(tunnelUrl)}`;

  console.log(`\n\nTúnel pronto: ${tunnelUrl}`);
  console.log(`Abra no celular (já configura o endereço): ${pairingUrl}\n`);
  console.log(
    "Mantenha este terminal aberto enquanto estiver usando o app no celular.\n",
  );
}

child.stdout.on("data", handleOutput);
child.stderr.on("data", handleOutput);

const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child.on("exit", (code) => process.exit(code ?? 0));
