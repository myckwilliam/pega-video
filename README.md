# Pega Vídeo

Cole uma URL, escolha a qualidade e baixe o vídeo — ou só o áudio em MP3. Tudo roda localmente no seu computador, sem cadastro, anúncios ou upload para terceiros.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![yt-dlp](https://img.shields.io/badge/powered%20by-yt--dlp-orange)

## O que ele faz

- Detecta o vídeo em links de YouTube, TikTok, Instagram, X, Vimeo, Facebook e mais de 1.000 sites suportados pelo yt-dlp.
- No TikTok, o setup instala `curl_cffi` em uma venv local para o yt-dlp conseguir impersonar o navegador e contornar o desafio anti-bot.
- Lista as opções reais de download: resoluções, codecs, FPS e tamanho estimado.
- Oferece “Melhor qualidade”, vídeos em MP4/WebM (mesclando áudio automaticamente) e áudio em MP3 ou no formato original.
- Mostra progresso, velocidade e tempo restante, com opção de cancelar.
- Guarda os últimos links analisados no navegador para baixar de novo.

## Requisitos

- Node.js 20+
- Python 3.9+ (opcional; usado pelo TikTok/Instagram via `curl_cffi` — o setup cria a venv automaticamente)
- ffmpeg (necessário para mesclar vídeo + áudio e converter MP3):

```bash
brew install ffmpeg
```

O yt-dlp é configurado automaticamente durante o `npm install`. Se houver Python 3.9+ disponível, o setup usa o pacote oficial (inicia em menos de 1 segundo); caso contrário, baixa o binário standalone para `bin/`. Para forçar uma atualização:

```bash
npm run setup -- --force
```

## Rodar

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Outros scripts:

```bash
npm run build      # build de produção
npm run start      # serve o build
npm run lint       # eslint
npm run typecheck  # TypeScript
npm run setup      # baixa/atualiza o yt-dlp local
npm run share      # expõe o app local via túnel Cloudflare (para celular)
```

## Como funciona

1. `POST /api/resolve` roda `yt-dlp -J` no link e agrupa os formatos em opções de vídeo e áudio.
2. `POST /api/downloads` cria um job em background (`yt-dlp` grava em uma pasta temporária).
3. A UI acompanha o progresso via polling em `GET /api/downloads`.
4. `GET /api/downloads/file?id=…` entrega o arquivo com suporte a `Range`; a pasta temporária é limpa após 30 minutos.

Temporários ficam em `$TMPDIR/pega-video`.

## Cookies (YouTube, Instagram e conteúdo privado)

Alguns sites exigem login ou pedem verificação anti-bot. O yt-dlp pode reaproveitar os cookies do seu navegador:

```bash
# usa os cookies do Chrome (macOS pode pedir a senha do Keychain)
YTDLP_COOKIES_FROM_BROWSER=chrome npm run dev

# ou exporte um cookies.txt e aponte o caminho
YTDLP_COOKIE_FILE=/caminho/para/cookies.txt npm run dev
```

Também é possível definir `YTDLP_PATH` (binário alternativo) e `FFMPEG_PATH`.

### TikTok e Instagram

O setup cria uma venv em `node_modules/.cache/pega-video/venv` e instala `curl_cffi`, necessário para o yt-dlp impersonar o TLS do navegador. Sem isso o TikTok responde com um desafio e o download falha. Para refazer o ambiente:

```bash
rm -rf node_modules/.cache/pega-video/venv && npm run setup
```


## Estrutura

```
app/
  api/resolve/          # metadata + formatos
  api/downloads/        # cria/consulta/cancela jobs
  api/downloads/file/   # entrega o arquivo (com Range)
components/             # UI
lib/
  ytdlp.ts              # wrapper do yt-dlp e normalização dos formatos
  jobs.ts               # fila de downloads em memória
  types.ts              # tipos compartilhados
scripts/
  install-yt-dlp.mjs    # baixa o binário local
bin/                    # yt-dlp (ignorado pelo git)
```

## Processar na sua máquina (IP residencial)

Na demo da Vercel, o botão **Processar na minha máquina** abre o app local com o link já preenchido. O download roda no seu computador, com o IP da sua casa — sem o bloqueio de datacenter e sem os limites do serverless.

- **Computador:** deixe `npm run dev` rodando. O endereço padrão é `http://localhost:3000`.
- **Celular na mesma Wi-Fi:** no site, clique em **Configurar** e use o endereço Network que o `npm run dev` mostra (ex.: `http://192.168.1.10:3000`).
- **Celular fora de casa:** rode `npm run share` e cole a URL `https://….trycloudflare.com` em **Configurar**. O Mac precisa estar ligado.

O celular não roda `yt-dlp`/`ffmpeg`; quem processa é o Mac. A URL do túnel funciona como uma senha: para uso público, coloque Cloudflare Access ou autenticação na frente.

```bash
brew install cloudflared
npm run share
```

## Deploy

Demo online: **https://pegavideo.vercel.app**

> **Atenção:** a Vercel serve como demonstração da interface. Use o botão **Processar na minha máquina** (ou rode localmente) para baixar de verdade: funções serverless são congeladas depois da resposta, não têm ffmpeg e o YouTube bloqueia IPs de datacenter. Para um site público 24/7, use um host com processo persistente (Railway, Render, Fly.io ou uma VPS) e, para YouTube, cookies/proxy residencial.

## Limitações

- Os downloads vivem em memória no processo do Next; reiniciar o servidor cancela jobs em andamento. Para uso pessoal/local isso é suficiente.
- DRM (Netflix, Disney+, etc.) não é suportado.
- O app não hospeda nem distribui conteúdo. Use apenas para vídeos que você tem direito de baixar.
