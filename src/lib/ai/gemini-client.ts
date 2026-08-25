import { GoogleGenAI } from "@google/genai";

// Server-only module: only ever imported from route.ts (App Router Route
// Handlers always execute server-side), never from a client component.

// Preview model per Google's official model list (ai.google.dev/gemini-api/docs/models).
// Kept as a single constant so swapping to a future GA release is a one-line change.
const MODEL_ID = "gemini-3-flash-preview";
const REQUEST_TIMEOUT_MS = 55_000;

export type StructuredGenerationInput = {
  systemInstruction: string;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
};

export type StructuredGenerationError =
  | "missing_api_key"
  | "timeout"
  | "rate_limited"
  | "upstream_error"
  | "invalid_response";

export type StructuredGenerationResult =
  | { ok: true; data: unknown }
  | { ok: false; errorCode: StructuredGenerationError; message: string };

export async function generateStructuredContent(
  input: StructuredGenerationInput
): Promise<StructuredGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      errorCode: "missing_api_key",
      message: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다.",
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: input.prompt,
      config: {
        systemInstruction: input.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: input.responseJsonSchema,
        abortSignal: controller.signal,
      },
    });

    const text = response.text;

    if (!text) {
      return {
        ok: false,
        errorCode: "invalid_response",
        message: "Gemini 응답이 비어 있습니다.",
      };
    }

    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return {
        ok: false,
        errorCode: "invalid_response",
        message: "Gemini 응답을 JSON으로 해석하지 못했습니다.",
      };
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        errorCode: "timeout",
        message: "Gemini 응답 시간이 초과되었습니다.",
      };
    }

    const status = extractStatusCode(error);

    if (status === 429) {
      return {
        ok: false,
        errorCode: "rate_limited",
        message: "Gemini API 요청 한도를 초과했습니다.",
      };
    }

    return {
      ok: false,
      errorCode: "upstream_error",
      message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}
