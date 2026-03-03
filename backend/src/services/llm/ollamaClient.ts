import axios from "axios";
import { env } from "../../config";
import { HttpError } from "../../utils/httpError";

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
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
          keep_alive: "10m",
          options: {
            temperature: 0.1,
            num_predict: 400,
          },
        },
        { timeout: env.OLLAMA_TIMEOUT_MS },
      );

      const raw: string = res.data?.response ?? "";
      const jsonStr = extractFirstJsonObject(raw);

      if (!jsonStr) {
        throw new HttpError(502, "LLM did not return JSON", {
          raw: raw.slice(0, 500),
        });
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
