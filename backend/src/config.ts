import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2:3b"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().default(30000),
  INGEST_MAX_CHARS: z.coerce.number().default(200000),
});

export const env = EnvSchema.parse(process.env);

export const ANALYSIS_VERSIONS = {
  pipeline: "analyze-v1",
  insights: "v3",
  prompt: "v3.0",
  model: env.OLLAMA_MODEL,
} as const;
