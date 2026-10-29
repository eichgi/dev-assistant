import { config as loadDotenv } from 'dotenv';
import { AppConfig, ModelProvider } from './types.js';

loadDotenv();

function getRequiredEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateProvider(provider: string): ModelProvider {
  if (provider !== 'anthropic' && provider !== 'openai') {
    throw new Error(`Invalid provider: ${provider}`);
  }
  return provider as ModelProvider;
}

const rawProvider = process.env["MODEL_PROVIDER"] ?? "anthropic";

export const config: AppConfig = {
  provider: validateProvider(rawProvider),
  anthropicApiKey: getRequiredEnvVar("ANTHROPIC_API_KEY", ""),
  openAIApiKey: getRequiredEnvVar("OPENAI_API_KEY", ""),
  anthropicModel: getRequiredEnvVar("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  openAIModel: getRequiredEnvVar("OPENAI_MODEL", "gpt-4o-mini"),
  openAIEmbeddingModel: getRequiredEnvVar("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  docsPath: getRequiredEnvVar("DOCS_PATH", "./docs/sample-project"),
  dbPath: getRequiredEnvVar("DB_PATH", "./data/vectors.db"),
  ragTopK: parseInt(getRequiredEnvVar("RAG_TOP_K", "5"), 10),
};

export function validateConfig(): void {
  if (config.provider === 'anthropic' && !config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for anthropic provider");
  }
  if (config.provider === 'openai' && !config.openAIApiKey) {
    throw new Error("OPENAI_API_KEY is required for openai provider");
  }
  if (config.ragTopK <= 0) {
    throw new Error("RAG_TOP_K must be greater than 0");
  }
  if (config.docsPath.trim() === "") {
    throw new Error("DOCS_PATH is required");
  }
}

export default config;