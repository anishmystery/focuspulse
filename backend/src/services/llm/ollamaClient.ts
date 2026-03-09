import axios from "axios";
import { env } from "../../config";
import { HttpError } from "../../utils/httpError";

function extractFirstJsonObject(text: string): string | null {
  // strip common wrappers
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return cleaned.slice(start, i + 1);
  }

  // We saw a "{" but never returned to depth 0 => truncated JSON
  return null;
}

export class OllamaClient {
  async generateJson<T>(prompt: string): Promise<T> {
    try {
      const res = await axios.post(
        `${env.OLLAMA_BASE_URL}/api/generate`,
        {
          model: env.OLLAMA_MODEL,
          prompt,
          stream: false,

          // Strongly nudges "JSON only" behavior (supported on modern Ollama)
          format: "json",

          keep_alive: "10m",
          options: {
            temperature: 0.1,
            // 400 is too small for your themes/hypotheses/recs sometimes
            num_predict: 1200,
          },
        },
        { timeout: env.OLLAMA_TIMEOUT_MS },
      );

      const raw: string = res.data?.response ?? "";
      const trimmed = raw.trim();

      // If JSON mode worked and it returned a clean object, parse directly.
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          return JSON.parse(trimmed) as T;
        } catch {
          // fall through to extractor
        }
      }

      const jsonStr = extractFirstJsonObject(raw);

      if (!jsonStr) {
        const sawOpenBrace = raw.includes("{");
        throw new HttpError(
          502,
          sawOpenBrace
            ? "LLM returned truncated JSON (increase num_predict or shorten output)"
            : "LLM did not return JSON",
          { raw: raw.slice(0, 500) },
        );
      }

      try {
        return JSON.parse(jsonStr) as T;
      } catch {
        throw new HttpError(502, "Failed to parse LLM JSON", {
          jsonStr: jsonStr.slice(0, 500),
        });
      }
    } catch (e: any) {
      if (e?.code === "ECONNABORTED") {
        throw new HttpError(504, "LLM request timed out", {
          model: env.OLLAMA_MODEL,
          timeoutMs: env.OLLAMA_TIMEOUT_MS,
          promptChars: prompt.length,
        });
      }
      if (e?.response?.data) {
        throw new HttpError(502, "LLM request failed", e.response.data);
      }
      throw e;
    }
  }
}
