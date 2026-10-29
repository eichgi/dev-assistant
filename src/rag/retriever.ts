import config from "../config.js";
import { RetrievedChunk } from "../types.js";
import { VectorStore } from "./vector-store.js";
import { generateEmbedding } from "./embeddings.js";

let vectorStoreInstance: VectorStore | null = null;

function getVectorStore(): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(config.dbPath);
  }
  return vectorStoreInstance;
}

export async function retrieveContext(
  query: string, 
  topK: number = config.ragTopK
): Promise<RetrievedChunk[]> {
  const vectorStore = getVectorStore();
  if (vectorStore.size === 0) {
    console.warn("Vector store is empty, no context available");
    return [];
  }

  const queryVector = await generateEmbedding(query);
  const topSearchResults = vectorStore.search(queryVector, topK);

  const chunks: RetrievedChunk[] = topSearchResults.map((result) => ({
    ...result.chunk,
    score: result.score,
  }));
  const preview = query.length > 50 ? query.slice(0, 50) + "..." : query;
  console.log(`Retrieved ${chunks.length} chunks for query: "${preview}"`);
  return chunks;
}

export function resetStore(): void {
  if(vectorStoreInstance) {
    vectorStoreInstance.close();
    vectorStoreInstance = null;
  }
}