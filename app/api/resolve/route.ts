import { errorResponse } from "@/lib/http";
import { normalizeInputUrl, resolveVideo } from "@/lib/ytdlp";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const raw =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).url
        : undefined;

    const url = normalizeInputUrl(raw);
    const video = await resolveVideo(url);

    return Response.json(video);
  } catch (error) {
    return errorResponse(error);
  }
}
