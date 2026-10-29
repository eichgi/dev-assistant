import config from "../config.js";
import { client } from "../llm/anthropic-client.js";
import { Message } from "../types.js";

const CHARS_PER_TOKEN = 4;

export class Conversation {
  private messages: Message[] = [];
  private systemPrompt: string;
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;

  constructor(systemPrompt: string = '') {
    this.systemPrompt = systemPrompt;
  }

  addUserMessage(text: string):void {
    this.messages.push({ role: 'user', content: text });
  }

  addAssistantMessage(text: string):void {
    this.messages.push({ role: 'assistant', content: text });
  }

  async sendMessage(text: string): Promise<string> {
    this.addUserMessage(text);
    const response = await client.messages.create({
      model: config.anthropicModel,
      messages: this.messages,
      max_tokens: 1024,
      ...(this.systemPrompt ? { system: this.systemPrompt } : {}),
    });
    
    this.addUsage(response.usage.input_tokens, response.usage.output_tokens);
    
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text block found in response');
    }
    this.addAssistantMessage(textBlock.text);
    return textBlock.text;
  }

  addUsage(inputTokens: number, outputTokens: number):void {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
  }

  getMessages(): Message[] {
    return this.messages;
  }

  getTotalInputTokens(): number {
    return this.totalInputTokens;
  }

  getTotalOutputTokens(): number {
    return this.totalOutputTokens;
  }

  clear():void {
    this.messages = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    console.log(`Conversation cleared.`);
  }

  getTurnCount(): number {
    return Math.floor(this.messages.length / 2);
  }

  estimateCurrentTokens(): number {
    const totalChars = this.messages.reduce((acc, message) => acc + message.content.length, 0);
    return Math.floor(totalChars / CHARS_PER_TOKEN);
  }

  getStats(): { turns: number, inputTokens: number, outputTokens: number } {
    return {
      turns: this.getTurnCount(),
      inputTokens: this.getTotalInputTokens(),
      outputTokens: this.getTotalOutputTokens(),
    };
  }


  getHistory(): Message[] {
    return this.messages;
  }
}
