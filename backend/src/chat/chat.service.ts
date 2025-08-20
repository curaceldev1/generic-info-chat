import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { TypesenseService } from 'src/typesense/typesense.service';
import * as showdown from 'showdown';

@Injectable()
export class ChatService implements OnModuleInit {
  private openai: OpenAI;
  private converter: showdown.Converter;
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private configService: ConfigService,
    private typesenseService: TypesenseService,
  ) {}

  onModuleInit() {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable.');
    }
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.converter = new showdown.Converter();
  }

  async ask(
    question: string,
    appName: string,
    baseUrl?: string,
    history?: { role: 'user' | 'assistant'; content: string }[],
    requestId?: string,
  ): Promise<any> {
    try {
      const HISTORY_LIMIT = 10;
      const SAFE_CHAR_LIMIT = 4000;

      const recentHistory = (history || []).slice(-HISTORY_LIMIT);

      // 1. Generate an embedding for the conversation (last N raw-text turns + current question)
      const conversationForEmbedding = [...recentHistory, { role: 'user', content: question }]
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')
        .slice(-SAFE_CHAR_LIMIT);

      const trace = requestId ? requestId.slice(0, 4) : '----';
      const embedStart = Date.now();
      this.logger.log(`Creating conversation embedding… [trace ${trace}]`);
      const queryEmbedding = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: conversationForEmbedding,
      });
      this.logger.log(`Embedding created in ${Date.now() - embedStart}ms. [trace ${trace}]`);

      // 2. Search for relevant documents in Typesense
      const searchStart = Date.now();
      this.logger.log(`Searching Typesense collection '${appName}'… [trace ${trace}]`);
      const searchResults = await this.typesenseService.search(
        appName,
        queryEmbedding.data[0].embedding,
        baseUrl,
        requestId,
      );
      this.logger.log(`Search returned ${searchResults?.length ?? 0} results in ${Date.now() - searchStart}ms. [trace ${trace}]`);

      // 3. Construct the context for the prompt
      const context = searchResults
        .map((result) => result.document.text)
        .join('\n\n')
        .slice(-SAFE_CHAR_LIMIT);
      this.logger.log(`Built prompt context. [trace ${trace}]`);

      // 4. Build chat messages with system + prior history (raw text only) + current question
      const systemContent =
        `You are a helpful AI assistant. Use ONLY the following retrieved context to answer. ` +
        `If insufficient, say you don't have enough information.\n\nContext:\n${context}`;

      const messages = [
        { role: 'system' as const, content: systemContent },
        ...recentHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: question },
      ];

      // 5. Generate a response using the chat completion API
      const llmStart = Date.now();
      this.logger.log(`Asking LLM (gpt-4o-mini)… [trace ${trace}]`);
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
      });
      this.logger.log(`LLM responded in ${Date.now() - llmStart}ms. [trace ${trace}]`);

      const markdownResponse = response.choices[0].message.content;
      if (!markdownResponse) {
        throw new Error('Received an empty response from the language model.');
      }
      const htmlResponse = this.converter.makeHtml(markdownResponse);

      const result = {
        answer: htmlResponse,
        answerRaw: markdownResponse,
        sources: searchResults.map((result: any) => result.document.source),
      };
      this.logger.log(`Returning ${(result.sources as any[])?.length ?? 0} sources. [trace ${trace}]`);
      return result;
    } catch (error) {
      const trace = requestId ? requestId.slice(0, 4) : '----';
      this.logger.error(`Could not complete chat: ${(error as any)?.message ?? error}. [trace ${trace}]`, error as any);
      throw error;
    }
  }
}
