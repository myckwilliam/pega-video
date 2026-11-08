import { AppError } from "@/lib/errors";

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("[pega-video]", error);
  return Response.json(
    { error: "Algo deu errado. Tente novamente em instantes." },
    { status: 500 },
  );
}
