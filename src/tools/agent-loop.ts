import Anthropic from '@anthropic-ai/sdk';
import { ToolDefinition } from '../types.js';
import { TOOL_DEFINITIONS } from './definitions.js';
import config from '../config.js';
import { client } from '../llm/anthropic-client.js';
import { executeTool } from './executor.js';

const MAX_ITERATIONS = 10;

export async function runWithTools(
  prompt?: string,
  systemPrompt?: string,
  tools?: ToolDefinition[]
): Promise<string> {

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: prompt ?? '',
    },
  ];
  const sdkTools = (tools ?? TOOL_DEFINITIONS) as Anthropic.Messages.Tool[];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(`Iteration ${iteration + 1} of ${MAX_ITERATIONS}`);

    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 4096,
      ...(systemPrompt && { system: systemPrompt }),
      messages,
      tools: sdkTools,
    });

    if(response.stop_reason === 'end_turn') {
      const finalText = response.content.filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
      console.log(`Final text: ${finalText}`);
      return finalText;
    }

    if(response.stop_reason === 'tool_use') {
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
      );

      const results = await Promise.all(
        toolUseBlocks.map(async (block) => {
          console.log('Ejecutando tool:', block.name, ' (', JSON.stringify(block.input), ')');
          const toolOutput = await executeTool(block.name, block.input as Record<string, unknown>);
          console.log('Herramienta completada:', block.name);
          return toolOutput;
        })
      );

      const toolResultContent: Anthropic.Messages.ToolResultBlockParam[] = 
        toolUseBlocks.map((block, index) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: results[index] ?? 'Error al ejecutar la herramienta',
        }));

      messages.push({
        role: 'user',
        content: toolResultContent,
      });

      continue;
    }

    console.warn('No se encontró un stop_reason válido ' + response.stop_reason);
    const consolidateMessageTest = response.content.filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

    return consolidateMessageTest || 'Sesion terminada: ' + response.stop_reason;
  }

  console.warn('Max iterations reached (', MAX_ITERATIONS, ')');
  return 'No se pudo completar la tarea. Iteraciones máximas alcanzadas.';
}