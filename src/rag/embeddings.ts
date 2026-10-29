import { config } from "../config.js";
import { OpenAI } from "openai";

const openAiClient = new OpenAI({
  apiKey: config.openAIApiKey,
});

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const response = await openAiClient.embeddings.create({
    model: config.openAIEmbeddingModel,
    input: text,
  });

  const embedding = response.data[0]?.embedding ?? [];

  return embedding;
}

export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
  const response = await openAiClient.embeddings.create({
    model: config.openAIEmbeddingModel,
    input: texts,
  });

  const embeddings = response.data.map((data) => data.embedding ?? []);
  
  return embeddings;
}