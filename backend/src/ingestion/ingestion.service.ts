import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FirecrawlApp from '@mendable/firecrawl-js';
import { TypesenseService } from 'src/typesense/typesense.service';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as fs from 'fs/promises';
import * as path from 'path';

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

  private async processPages(
    pages: Array<{ markdown?: string; metadata?: { sourceURL?: string } }>,
    appName: string,
  ): Promise<{ totalChunks: number; totalFailed: number; pageCount: number }> {
    let totalChunks = 0;
    let totalFailed = 0;
    let pageCount = 0;
    for (const page of pages) {
      if (page.markdown && page.metadata && page.metadata.sourceURL) {
        const splitter = new MarkdownTextSplitter({
          chunkSize: 10000,
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
        pageCount += 1;
      }
    }
    return { totalChunks, totalFailed, pageCount };
  }

  // Removed non-LLM crawl method; LLM is the default when Crawl4AI is configured

  private formatPrompt(template: string, variables: Record<string, string>): string {
    let output = template;
    for (const [key, value] of Object.entries(variables)) {
      output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return output;
  }

  private async crawlWithCrawl4AIUsingLLM(url: string, appName: string): Promise<{ data: Array<{ markdown?: string; metadata?: { sourceURL?: string } }> } | null> {
    const baseUrl = this.configService.get<string>('CRAWL4AI_BASE_URL') || process.env.CRAWL4AI_BASE_URL;
    if (!baseUrl) return null;

    const prompt = `Extract information that is most relevant for a Q&A assistant about ${appName}.`;
    const endpoint = `${baseUrl}/md`;

    try {
      const payload = {
        url,
        f: 'llm',
        q: prompt,
        c: '0',
      };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      } as RequestInit);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Crawl4AI LLM request failed (${res.status}): ${text}`);
      }
      const json = await res.json();
      console.log('Crawl4AI LLM response:', json);

      if (json && typeof json === 'object' && json.markdown) {
        return { data: [{ markdown: json.markdown, metadata: { sourceURL: url } }] };
      }
      throw new Error('Crawl4AI LLM response missing expected markdown content');
    } catch (err) {
      console.error('Error calling Crawl4AI LLM service:', err);
      throw err;
    }
  }

  private async processLocalDataIfAvailable(appName: string): Promise<{ message: string } | null> {
    const nodeEnv = this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV;
    if (!['development', 'local'].includes((nodeEnv || '').toLowerCase())) {
      return null;
    }
    const localDir = path.resolve(__dirname, '..', '..', 'sites', appName);
    try {
      const stat = await fs.stat(localDir);
      if (stat.isDirectory()) {
        console.log(`Local environment detected (${nodeEnv}). Found local site data at: ${localDir}. Using it instead of Firecrawl.`);
        const files = await fs.readdir(localDir);
        let totalChunks = 0;
        let totalFailed = 0;
        let pagesProcessed = 0;
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const fullPath = path.join(localDir, file);
          try {
            const raw = await fs.readFile(fullPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (!parsed?.markdown) {
              console.warn(`Skipping file without markdown: ${file}`);
              continue;
            }
            const sourceURL = parsed?.metadata?.sourceURL || parsed?.metadata?.url || `local:${file.replace(/\.json$/, '')}`;
            const splitter = new MarkdownTextSplitter({
              chunkSize: 1000,
              chunkOverlap: 200,
            });
            const chunks = await splitter.splitText(parsed.markdown);
            const { processed, failed } = await this.typesenseService.generateAndStoreEmbedding(
              appName,
              sourceURL,
              chunks,
            );
            totalChunks += processed;
            totalFailed += failed;
            pagesProcessed += 1;
          } catch (fileErr) {
            console.error(`Failed processing local file ${file}:`, fileErr);
          }
        }
        if (pagesProcessed === 0) {
          console.warn(`No usable JSON files found in local directory: ${localDir}. Falling back to Firecrawl.`);
          return null;
        }
        if (totalFailed > 0) {
          throw new Error(`Local ingestion partially failed: ${totalFailed} chunks failed, ${totalChunks} chunks indexed from ${pagesProcessed} local pages under ${localDir}.`);
        }
        return {
          message: `Successfully indexed ${totalChunks} chunks from ${pagesProcessed} local pages for app '${appName}'.`,
        };
      }
      return null;
    } catch (localErr) {
      console.log(`No local site data found for app '${appName}' at ${localErr?.path || 'N/A'}. Proceeding with Firecrawl.`);
      return null;
    }
  }

  async crawlUrl(url: string, appName: string) {
    try {
      console.log(`Crawling URL: ${url} for app: ${appName}`);

      // 1. If running locally, attempt to process pre-scraped site data first
      // const localResult = await this.processLocalDataIfAvailable(appName);
      // if (localResult) {
      //   return localResult;
      // }

      // 2. If Crawl4AI service is configured, use LLM extraction by default
      const crawl4aiBase = this.configService.get<string>('CRAWL4AI_BASE_URL') || process.env.CRAWL4AI_BASE_URL;
      if (crawl4aiBase) {
        try {
          const resultLlm = await this.crawlWithCrawl4AIUsingLLM(url, appName);
          if (resultLlm) {
            const { totalChunks, totalFailed, pageCount } = await this.processPages(resultLlm.data, appName);
            if (totalFailed > 0) {
              throw new Error(
                `Ingestion partially failed: ${totalFailed} chunks failed, ${totalChunks} chunks indexed from ${pageCount} pages under ${url}.`,
              );
            }
            return { message: `Successfully crawled and indexed ${totalChunks} chunks from ${pageCount} pages under ${url}.` };
          }
        } catch (e) {
          console.warn('Crawl4AI LLM path failed; falling back to Firecrawl. Error:', (e as any)?.message || e);
        }
      }
      // 3. Use Firecrawl's recursive crawl
      const result = await this.firecrawl.crawlUrl(url, {
        limit: 100, // max number of pages
        maxDepth: 3, // crawl depth
        scrapeOptions: {
          formats: ['markdown'],
        },
      });

      if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
        const { totalChunks, totalFailed } = await this.processPages((result as any).data, appName);
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
