import * as readline from 'readline';
import { config } from '../config.js';
import { processDirectory } from '../rag/chunker.js';
import { VectorStore } from '../rag/vector-store.js';
import { generateEmbeddings } from '../rag/embeddings.js';
import { resetStore } from '../rag/retriever.js';
import { DevAssistantAgent } from '../agent/agent.js';
import { ALL_TOOL_DEFINITIONS } from '../agent/tool-registry.js';
import { checkGuardrails, createRateLimiter } from '../security/guardrails.js';
import { calculateCost } from '../utils/cost-calculator.js';

async function ingestDocs(docsPath: string): Promise<void> {
  console.log(`\nIniciando ingestión desde: ${docsPath}`);

  const chunks = await processDirectory(docsPath);

  if (chunks.length === 0) {
    console.log("No se encontraron archivos .md en ese directorio.");
    return;
  }

  console.log(`Generando embeddings para ${chunks.length} chunks...`);
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  const store = new VectorStore(config.dbPath);
  store.clear();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    if (chunk && embedding) store.insert(chunk, embedding);
  }

  console.log(`${store.size} chunks almacenados en ${config.dbPath}`);
  store.close();

  // Reiniciar el singleton
  resetStore();
  console.log("Vector store actualizado — listo para búsquedas\n");
}

export async function startCLI(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  //const conversation = new Conversation(DOCUMENTATION_ASSISTANT_PROMPT);
  const devAssistantAgent = new DevAssistantAgent();
  const rateLimiter = createRateLimiter();

  console.log("╔════════════════════════════════════════╗");
  console.log("║         DevAssistant v1.0              ║");
  console.log("║    Agente de Documentación y Código    ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("");
  console.log("💬 Escribe tu pregunta y presiona Enter.");
  console.log("💡 Tip: usa /ingest para cargar documentación");
  console.log("   Comandos: /ingest [path],");
  console.log("             /clear, /stats, /tools, /exit");
  console.log("");

  const promptUser = ():void => {
    rl.question('Enter your message: ', async (input) => {
      const userInput = input.trim();
      if (!userInput) {
        promptUser();
        return;
      }

      if (userInput === "/stats") {
        const stats = devAssistantAgent.getStats();

        const sessionCost = calculateCost({
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          model: config.anthropicModel,
        });

        console.log(`\n📊 Estadísticas de la conversación:`);
        console.log(`   • Turnos: ${stats.turns}`);
        console.log(`   • Tokens de entrada acumulados: ${stats.inputTokens}`);
        console.log(`   • Tokens de salida acumulados: ${stats.outputTokens}`);
        console.log(`   • Tools calls en ultimo turno: ${stats.toolCallsLastTurn}\n`);
        console.log(`   • Costo de la sesión: ${sessionCost.formatted}`);
        promptUser();
        return;
      }

      if (userInput === "/exit") {
        console.log("👋 Adiós! Gracias por usar DevAssistant.");
        const stats = devAssistantAgent.getStats();
        const sessionCost = calculateCost({
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          model: config.anthropicModel,
        });
        
        console.log(`\n📊 Estadísticas de la conversación: ${stats.turns} turnos, 
          ${stats.inputTokens} tokens de entrada, 
          ${stats.outputTokens} tokens de salida
          ${sessionCost.formatted} costo estimado
        `);
        rl.close();
        return;
      }
      
      if (userInput === '/clear') {
        devAssistantAgent.clearHistory();
        console.log('Historial de conversación limpiado');
        promptUser();
        return;
      }

      if (userInput === "/tools") {
        console.log(`\nTools disponibles (${ALL_TOOL_DEFINITIONS.length}):`);
        for (const tool of ALL_TOOL_DEFINITIONS) {
          const params = Object.keys(tool.input_schema.properties).join(", ");
          console.log(`   • ${tool.name}(${params})`);
          console.log(`     ${tool.description.split(".")[0]}.`);
        }
        console.log("");
        promptUser();
        return;
      }

      if(userInput.startsWith("/ingest")) {
        const inputParts = userInput.split(" ");
        const docsDirectory = inputParts[1] ?? config.docsPath;
        try {
          await ingestDocs(docsDirectory);
        } catch (error) {
          const err = error as Error;
          console.error('Error al ingestar la documentación:', err.message);
        }
        console.log(' ');
        promptUser();
        return;
      }

      try {
        // conversation.addUserMessage(userInput);
        // const chunks = await retrieveContext(userInput);
        // if(!chunks.length) {
        //   const message = "No tengo esa información en la documentación disponible. Usa el comando /ingest";
        //   console.log(message);
        // }
        // // const response = await runWithTools(userInput, DOCUMENTATION_ASSISTANT_PROMPT, TOOL_DEFINITIONS);

        // const response = await askWithRAG(userInput, (outputChunk) => {
        //   process.stdout.write(outputChunk);
        // });

        // //process.stdout.write('🤖 responde: : '+response+'\n\n');
        // /**
        // const record = conversation.getHistory();

        // let fullMessage = '';
        // const stream = await client.messages.stream({
        //   model: config.anthropicModel,
        //   messages: record,
        //   max_tokens: 1024,
        //   system: DOCUMENTATION_ASSISTANT_PROMPT,
        // });

        // stream.on('text', (chunk) => {
        //   fullMessage += chunk;
        //   process.stdout.write(chunk);
        // });

        // const finalMessage = await stream.finalMessage();
        // conversation.addUsage(finalMessage.usage.input_tokens, finalMessage.usage.output_tokens);

        // process.stdout.write('\n');
        // */ 
        // conversation.addAssistantMessage(response);
        const guardrails = checkGuardrails(userInput, rateLimiter);
        if(!guardrails.safe) {
          console.warn('\nGuardrail violation: ' + guardrails.reason);
          promptUser();
          return;
        }

        const secureText = guardrails.sanitized;

        process.stdout.write('\n Dev Assistant Agent 🤖:\n');
        const response = await devAssistantAgent.chat(secureText, (fragment) => {
          process.stdout.write(fragment);
        });
        
        process.stdout.write('\n');
        
        if(response.toolsUsed.length > 0) {
          process.stdout.write('\n Tools utilizados: ' + response.toolsUsed.join(', ') + '\n');
        }

        console.log('');

      } catch (error) {
        const err = error as Error;
        console.error('Error al procesar la entrada:', err.message);
      }

      promptUser();
    });
  };

  promptUser();
}