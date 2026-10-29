import * as fs from 'fs';
import * as path from 'path';
import { streamClaude } from '../llm/streaming.js';
import { CODE_REVIEWER_PROMPT } from '../llm/prompts.js';

// Extensiones de archivo que soportamos
const SUPPORTED_FILE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go",
  ".rs", ".java", ".cs", ".cpp", ".c", ".rb",
  ".php", ".swift", ".kt", ".sql",
]);
// Límite de tamaño: archivos muy grandes consumen muchos tokens
const MAX_CHARS = 20_000;

async function reviewFile(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`El archivo ${absolutePath} no existe.`);
    process.exit(1);
  }

  const fileStats = fs.statSync(absolutePath);
  if (fileStats.isDirectory()) {
    throw new Error(`El archivo ${filePath} es un directorio.`);
  }

  const extension = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
    console.warn(`El archivo ${filePath} no es un archivo soportado.`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf-8');
  const totalLines = fileContent.split('\n').length;
  const fileName = path.basename(absolutePath);

  let reviewContent = fileContent;
  let sizeWarning = '';

  if (fileContent.length > MAX_CHARS) {
    reviewContent = reviewContent.slice(0, MAX_CHARS);
    sizeWarning = `⚠️ El archivo ${fileName} es muy grande (${fileContent.length} caracteres). Se ha truncado a ${MAX_CHARS} caracteres.`;
  }

  // Mostrar header
  console.log("╔════════════════════════════════════════╗");
  console.log("║       DevAssistant — Code Reviewer     ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n📄 Archivo: ${fileName}`);
  console.log(`   Ruta: ${absolutePath}`);
  console.log(`   Líneas: ${totalLines} | Caracteres: ${fileContent.length}`);
  if (sizeWarning) console.log(sizeWarning);
  console.log("\nAnalizando con Claude...\n");
  console.log("─".repeat(60));

  // Construir el prompt con el contexto del archivo
  const prompt = `Por favor, revisa el siguiente archivo de código:
    **Archivo:** \`${fileName}\`
    **Extensión:** ${extension || "desconocida"}
    **Líneas:** ${totalLines}
    \`\`\`${extension.slice(1)}
    ${reviewContent}
    \`\`\``;

    await streamClaude(prompt, CODE_REVIEWER_PROMPT);
    console.log("─".repeat(60));
    console.log("✅ Revisión completada con éxito.");
    console.log("\n");
}

const inputArgs = process.argv.slice(2);
if (inputArgs.length === 0) {
  console.error("Error: Debes proporcionar al menos un archivo para revisar.");
  console.error('Uso: npm run review <ruta-del-archivo>');
  process.exit(1);
}

const filePath = inputArgs[0];
if (!filePath) {
  console.error("Error: Debes proporcionar al menos un archivo para revisar.");
  console.error('Uso: npm run review <ruta-del-archivo>');
  process.exit(1);
}

await reviewFile(filePath).catch((error: Error) => {
  console.error(`Error al revisar el archivo ${filePath}:`, error.message);
  process.exit(1);
});