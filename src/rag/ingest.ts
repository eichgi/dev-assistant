import * as fs from "fs/promises";
import * as path from "path";
import config from "../config.js";
import { processDirectory } from "./chunker.js";
import { generateEmbeddings } from "./embeddings.js";
import { VectorStore } from "./vector-store.js";

const PREVIEW_JSON = path.join(path.dirname(config.dbPath), "chunks-preview.json");

export async function runIngest(docsPath: string = config.docsPath): Promise<void> {  
  console.log("Starting RAG ingestion...");

  const chunks = await processDirectory(docsPath);
  if(chunks.length === 0) {
    console.warn("No markdown found in the directory");
  }

  console.log(`Found ${chunks.length} chunks in the directory`);

  console.log("Generating embeddings...");
  
  const texts = chunks.map((chunk) => chunk.content);
  const embeddings = await generateEmbeddings(texts);
  const dimensions = embeddings[0]?.length ?? 0;
  console.log(`Generated ${embeddings.length} embeddings with ${dimensions} dimensions`);

  const preview = chunks.map((chunk, index) => ({
    id: chunk.id,
    content: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? "..." : ""),
    metadata: chunk.metadata,
    embeddingsPreview: (embeddings[index] ?? []).slice(0, 5),
    embeddingDims: embeddings[index] ?? 0
  }));

  await fs.mkdir(path.dirname(PREVIEW_JSON), { recursive: true });
  await fs.writeFile(PREVIEW_JSON, JSON.stringify(preview, null, 2), "utf-8");
  console.log(`Storing vector in ${config.dbPath}...`);

  const store = new VectorStore(config.dbPath);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    if (chunk && embedding) {
      store.insert(chunk, embedding);
    }
  }
  console.log(`Stored ${store.size} chunks in the vector store`);
  store.close();
  console.log("Ingestion completed successfully");
}

runIngest().catch((error) => {
  console.error("Error during RAG ingestion:", error);
  process.exit(1);
});