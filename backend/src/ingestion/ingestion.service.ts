import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FirecrawlApp from '@mendable/firecrawl-js';
import { TypesenseService } from 'src/typesense/typesense.service';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class IngestionService implements OnModuleInit {
  private firecrawl: FirecrawlApp;

  constructor(
    private configService: ConfigService,
    private typesenseService: TypesenseService,
    @InjectQueue('ingestion') private readonly ingestionQueue: Queue,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('FIRECRAWL_API_KEY');
    if (!apiKey) {
      throw new Error('Firecrawl API key is not configured. Please set FIRECRAWL_API_KEY in your environment.');
    }
    this.firecrawl = new FirecrawlApp({ apiKey });
  }

  async enqueueCrawl(url: string, appName: string) {
    return this.ingestionQueue.add(
      'crawl',
      { url, appName },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
  }

  async crawlUrl(url: string, appName: string) {
    try {
      console.log(`Crawling URL: ${url} for app: ${appName}`);
      // Use Firecrawl's recursive crawl
      const result = await this.firecrawl.crawlUrl(url, {
        limit: 100, // max number of pages
        maxDepth: 3, // crawl depth
        scrapeOptions: {
          formats: ['markdown'],
        },
      });

      if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
        let totalChunks = 0;
        let totalFailed = 0;
        for (const page of (result as any).data) {
          if (page.markdown && page.metadata && page.metadata.sourceURL) {
            const splitter = new MarkdownTextSplitter({
              chunkSize: 1000,
              chunkOverlap: 200,
            });
            const chunks = await splitter.splitText(page.markdown);
            const { processed, failed } = await this.typesenseService.generateAndStoreEmbedding(
              appName,
              page.metadata.sourceURL,
              chunks,
            );
            totalChunks += processed;
            totalFailed += failed;
          }
        }
        if (totalFailed > 0) {
          throw new Error(
            `Ingestion partially failed: ${totalFailed} chunks failed, ${totalChunks} chunks indexed from ${(result as any).data.length} pages under ${url}.`,
          );
        }
        return {
          message: `Successfully crawled and indexed ${totalChunks} chunks from ${(result as any).data.length} pages under ${url}.`,
        };
      }

      if (result && typeof result === 'object' && 'error' in result) {
        throw new Error(String((result as any).error));
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
