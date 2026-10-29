import Anthropic  from "@anthropic-ai/sdk";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt.js";
import { ALL_TOOL_DEFINITIONS } from "./tool-registry.js";
import { client } from "../llm/anthropic-client.js";
import config from "../config.js";
import { executeAnyTool } from "./tool-registry.js";
import { AgentResponse } from "../types.js";

const MAX_TOOL_CALLS = 8;

export class DevAssistantAgent {
  private messages: Anthropic.Messages.MessageParam[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private turns: number = 0;
  private toolCallsLastTurn: number = 0;

  constructor(private readonly systemPrompt: string = AGENT_SYSTEM_PROMPT) {}

  async chat(userMessage: string, onChunk?: (fragment: string) => void): Promise<AgentResponse> {
    this.turns++;
    this.toolCallsLastTurn = 0;

    const toolsUsed: string[] = [];
    let inputTokensThisTurn = 0;
    let outputTokensThisTurn = 0;

    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    console.log(`Agente procesando turno...\n[Turno ${this.turns}]`);
    const sdkTools = ALL_TOOL_DEFINITIONS as Anthropic.Messages.Tool[];
    while (this.toolCallsLastTurn < MAX_TOOL_CALLS) {
      const response = await client.messages.create({
        model: config.anthropicModel,
        max_tokens: 4096,
        system: this.systemPrompt,
        messages: this.messages,
        tools: sdkTools,
      });

      inputTokensThisTurn += response.usage?.input_tokens;
      outputTokensThisTurn += response.usage?.output_tokens;
      this.totalInputTokens += response.usage?.input_tokens;
      this.totalOutputTokens += response.usage?.output_tokens;

      if (response.stop_reason === 'end_turn') {
        const finalText = response.content
          .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        if (onChunk) {
          const stream = await client.messages.stream({
            model: config.anthropicModel,
            max_tokens: 4096,
            system: this.systemPrompt,
            messages: this.messages,
            tools: sdkTools,
          });

          let streamedText = '';
          for await (const event of stream) {
            if(event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              onChunk(event.delta.text);
              streamedText += event.delta.text;
            }
          }

          this.messages.push({
            role: 'assistant',
            content: streamedText || finalText,
          });
          console.log('Respuesta final generada \n');
          return {
            text: streamedText || finalText,
            toolsUsed,
            inputTokens: inputTokensThisTurn,
            outputTokens: outputTokensThisTurn,
          }
        } else {
          this.messages.push({
            role: 'assistant',
            content: finalText,
          });
          console.log('Respuesta final generada \n');
          return {
            text: finalText,
            toolsUsed,
            inputTokens: inputTokensThisTurn,
            outputTokens: outputTokensThisTurn,
          }
        }
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
        );

        if (this.toolCallsLastTurn + toolUseBlocks.length > MAX_TOOL_CALLS) {
          console.warn(
            `Límite de ${MAX_TOOL_CALLS} tool calls alcanzado en este turno`
          );
          const limitMessage =
            `He alcanzado el límite de ${MAX_TOOL_CALLS} llamadas a herramientas por turno. ` +
            `Para completar esta tarea, intenta dividirla en preguntas más específicas.`;
        
          this.messages.push({
            role: "assistant",
            content: limitMessage,
          });
        
          return {
            text: limitMessage,
            toolsUsed,
            inputTokens: inputTokensThisTurn,
            outputTokens: outputTokensThisTurn,
          };
        }

        this.messages.push({
          role: 'assistant',
          content: response.content,
        });
  
        const results = await Promise.all(
          toolUseBlocks.map(async (block) => {
            this.toolCallsLastTurn++;
            const toolNum = this.toolCallsLastTurn;
            console.log(`Ejecutando tool ${toolNum}/${MAX_TOOL_CALLS}: ${block.name} (`, JSON.stringify(block.input), ')');
            const toolOutput = await executeAnyTool(block.name, block.input as Record<string, unknown>);
            console.log('Herramienta completada:', block.name);
            toolsUsed.push(block.name);
            return toolOutput;
          })
        );

        const toolResultContent: Anthropic.Messages.ToolResultBlockParam[] = 
        toolUseBlocks.map((block, index) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: results[index] ?? 'Error al ejecutar la herramienta',
        }));

        this.messages.push({
          role: 'user',
          content: toolResultContent,
        });
        
        continue;
      }

      console.warn('No se encontró un stop_reason válido ' + response.stop_reason);

      const unexpectedText = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      const unexpectedMessage = unexpectedText || 'Sesion terminada inesperadamente: ' + response.stop_reason;

      this.messages.push({
        role: 'assistant',
        content: unexpectedMessage,
      });

      return {
        text: unexpectedMessage,
        toolsUsed,
        inputTokens: inputTokensThisTurn,
        outputTokens: outputTokensThisTurn,
      }
    }

    console.warn(
      `Límite de ${MAX_TOOL_CALLS} tool calls alcanzado en este turno`
    );
    const limitMessage =
      `He alcanzado el límite de ${MAX_TOOL_CALLS} llamadas a herramientas por turno. ` +
      `Para completar esta tarea, intenta dividirla en preguntas más específicas.`;
  
    this.messages.push({
      role: "assistant",
      content: limitMessage,
    });
  
    return {
      text: limitMessage,
      toolsUsed,
      inputTokens: inputTokensThisTurn,
      outputTokens: outputTokensThisTurn,
    };
  }

  clearHistory(): void {
    this.messages = [];
    this.turns = 0;
    this.toolCallsLastTurn = 0;
    console.log('Historial de conversación limpiado');
  }

  getStats(): {
    inputTokens: number;
    outputTokens: number;
    turns: number;
    toolCallsLastTurn: number;
  } {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      turns: this.turns,
      toolCallsLastTurn: this.toolCallsLastTurn,
    };
  }
}