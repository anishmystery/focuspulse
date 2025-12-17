export interface LLMClient {
  generateJson<T>(prompt: string): Promise<T>;
}
