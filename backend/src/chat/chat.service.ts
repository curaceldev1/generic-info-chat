import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { TypesenseService } from 'src/typesense/typesense.service';

@Injectable()
export class ChatService implements OnModuleInit {
  private openai: OpenAI;

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
  }

  async ask(question: string): Promise<any> {
    try {
      // 1. Generate an embedding for the user's question
      const queryEmbedding = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: question,
      });

      // 2. Search for relevant documents in Typesense
      const searchResults = await this.typesenseService.search(
        queryEmbedding.data[0].embedding,
      );

      // 3. Construct the context for the prompt
      const context = searchResults
        .map((result) => result.document.text)
        .join('\n\n');

      // 4. Construct the prompt
      const prompt = `
        You are a helpful AI assistant. Answer the user's question based on the following context.
        If the context does not provide an answer, say "I'm sorry, I don't have enough information to answer that question."

        Context:
        ${context}

        Question:
        ${question}
      `;

      // 5. Generate a response using the chat completion API
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });

      return {
        answer: response.choices[0].message.content,
        sources: searchResults.map((result) => result.document.source),
      };
    } catch (error) {
      console.error('Error in ChatService ask method:', error);
      throw error;
    }
  }
}
