import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FirecrawlApp from '@mendable/firecrawl-js';
import { TypesenseService } from 'src/typesense/typesense.service';
import { MarkdownTextSplitter } from 'langchain/text_splitter';

@Injectable()
export class IngestionService implements OnModuleInit {
  private firecrawl: FirecrawlApp;

  constructor(
    private configService: ConfigService,
    private typesenseService: TypesenseService,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('FIRECRAWL_API_KEY');
    if (!apiKey) {
      throw new Error('Firecrawl API key is not configured. Please set FIRECRAWL_API_KEY in your environment.');
    }
    this.firecrawl = new FirecrawlApp({ apiKey });
  }

  async crawlUrl(url: string) {
    try {
      const result = await this.firecrawl.scrapeUrl(url);

      if (result && 'markdown' in result && result.markdown) {
        const splitter = new MarkdownTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });

        const chunks = await splitter.splitText(result.markdown);

        await this.typesenseService.generateAndStoreEmbedding(url, chunks);

        return {
          message: `Successfully crawled and indexed ${chunks.length} chunks from ${url}.`,
        };
      }

      if (result && 'error' in result) {
        throw new Error(String(result.error));
      }

      throw new Error(
        'Failed to crawl the URL or no markdown content was returned.',
      );
    } catch (error) {
      console.error('Error crawling URL:', error);
      throw error;
    }
  }
}
