import config from "./config.js";
import { askClaude } from "./llm/anthropic-client.js";
import { CODE_REVIEWER_PROMPT, DOCUMENTATION_ASSISTANT_PROMPT } from "./llm/prompts.js";
import { streamClaude } from "./llm/streaming.js";
import { startCLI } from "./chat/cli.js";

const CODIGO_CON_PROBLEMAS = `
async function getUser(id) {
  const query = "SELECT * FROM users WHERE id = " + id;
  const result = await db.query(query);
  return result[0];
}
function calcularDescuento(precio, tipo) {
  if (tipo == "vip") {
    return precio * 0.8;
  } else if (tipo == "regular") {
    return precio * 0.9;
  } else {
    return precio;
  }
}
`;

async function main(): Promise<void> {
  // console.log("╔════════════════════════════════════════╗");
  // console.log("║        DevAssistant - Curso IA         ║");
  // console.log("║        Streaming prompt                ║");
  // console.log("╚════════════════════════════════════════╝");
  // console.log("");
  // console.log("Enviando pregunta a Claude");
  // console.log("");
  // //const question = `Revisa este código: \`\`\`javascript\n${CODIGO_CON_PROBLEMAS}\`\`\`
  // //`;
  // const question = 'Qué es Async/Await? Dame una respuesta muy breve';
  // console.log(`Pregunta: ${question}`);
  // console.log("📋 Configuración activa:");
  // console.log(`   • Provider:       ${config.provider}`);
  // console.log('-'.repeat(20));
  // //const answer = await askClaude(question, CODE_REVIEWER_PROMPT);
  // const answerStream = await streamClaude(question, DOCUMENTATION_ASSISTANT_PROMPT);
  // console.log(`Respuesta: ${answerStream}`);
  // console.log("");
  // console.log("🚀 Próximo paso: Sección 3 — Primera llamada a Claude API");

  startCLI().catch((error: Error) => {
    console.error('Error al iniciar el CLI:', error.message);
    process.exit(1);
  });
}

main().catch(console.error);