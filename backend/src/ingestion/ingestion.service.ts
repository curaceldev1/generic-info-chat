import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FirecrawlApp from '@mendable/firecrawl-js';
import { TypesenseService } from 'src/typesense/typesense.service';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as fs from 'fs/promises';
import * as path from 'path';
import Crawl4AI from 'crawl4ai';
import * as crypto from 'crypto';

@Injectable()
export class IngestionService implements OnModuleInit {
  private firecrawl: FirecrawlApp;
  private crawl4ai?: Crawl4AI;

  constructor(
    private configService: ConfigService,
    private typesenseService: TypesenseService,
    @InjectQueue('ingestion') private readonly ingestionQueue: Queue,
  ) {}

  onModuleInit() {
    const firecrawlApiKey = this.configService.get<string>('FIRECRAWL_API_KEY');
    if (firecrawlApiKey) {
      this.firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey });
    }

    const crawl4aiBase = this.configService.get<string>('CRAWL4AI_BASE_URL') || process.env.CRAWL4AI_BASE_URL;
    const crawl4aiToken = this.configService.get<string>('CRAWL4AI_API_TOKEN') || process.env.CRAWL4AI_API_TOKEN;
    if (crawl4aiBase) {
      this.crawl4ai = new Crawl4AI({
        baseUrl: crawl4aiBase,
        apiToken: crawl4aiToken,
        timeout: 60000,
        debug: true,
      });
    }
  }

  async enqueueCrawl(url: string, appName: string) {
    return this.ingestionQueue.add(
      'crawl',
      { url, appName },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
  }

  /**
   * Attempt to resolve a root/base URL from an arbitrary page URL.
   */
  private getSiteRoot(input: string): string | null {
    try {
      const u = new URL(input);
      u.pathname = '/';
      u.search = '';
      u.hash = '';
      return u.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  private async safeFetch(url: string, timeoutMs = 10000): Promise<string | null> {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'CuracelIngestionBot/1.0' } });
      clearTimeout(to);
      if (!res.ok) return null;
      if ((res.headers.get('content-type') || '').includes('text') || (res.headers.get('content-type') || '').includes('xml')) {
        return await res.text();
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseSitemap(xml: string): string[] {
    // Super light-weight XML parsing via regex; sufficient for urlset / sitemapindex
    const urls: string[] = [];
    const locRegex = /<loc>([^<]+)<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml))) {
      const url = match[1].trim();
      if (url.startsWith('http')) urls.push(url);
    }
    return urls;
  }

  private dedupeAndLimit(urls: string[], max: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of urls) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
        if (out.length >= max) break;
      }
    }
    return out;
  }

  private async discoverSitemapUrls(seedUrl: string): Promise<string[] | null> {
    const root = this.getSiteRoot(seedUrl);
    if (!root) return null;
    const candidates = [
      `${root}/sitemap.xml`,
      `${root}/sitemap_index.xml`,
      `${root}/sitemap-index.xml`,
    ];
    // Attempt robots.txt for additional sitemap declarations
    const robotsTxt = await this.safeFetch(`${root}/robots.txt`);
    if (robotsTxt) {
      const lines = robotsTxt.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^sitemap:\s*(.+)$/i);
        if (m && m[1]) candidates.push(m[1].trim());
      }
    }
    const discovered: string[] = [];
    const visitedSitemaps = new Set<string>();
    const maxNested = 5;
    const enqueue = (u: string) => {
      try { const nu = new URL(u).toString(); if (!visitedSitemaps.has(nu)) candidates.push(nu); } catch { /* noop */ }
    };
    while (candidates.length && visitedSitemaps.size < maxNested) {
      const sm = candidates.shift();
      if (!sm || visitedSitemaps.has(sm)) continue;
      visitedSitemaps.add(sm);
      const xml = await this.safeFetch(sm, 12000);
      if (!xml) continue;
      const urls = this.parseSitemap(xml);
      if (urls.length === 0) continue;
      // Heuristic: if many <loc> entries end with .xml treat as sitemapindex
      const xmlChildren = urls.filter(u => u.toLowerCase().endsWith('.xml'));
      if (xmlChildren.length && xmlChildren.length >= urls.length * 0.5) {
        xmlChildren.forEach(enqueue);
      } else {
        discovered.push(...urls.filter(u => !u.toLowerCase().endsWith('.xml')));
      }
    }
    const maxUrls = Number(this.configService.get<string>('SITEMAP_MAX_URLS') || process.env.SITEMAP_MAX_URLS || 100);
    const final = this.dedupeAndLimit(discovered, maxUrls);
    if (final.length === 0) return null;
    return final;
  }

  private async processPages(
    pages: Array<{ markdown?: string; metadata?: { sourceURL?: string } }>,
    appName: string,
    options?: { dedupe?: Set<string> },
  ): Promise<{ totalChunks: number; totalFailed: number; pageCount: number }> {
    let totalChunks = 0;
    let totalFailed = 0;
    let pageCount = 0;
    for (const page of pages) {
      if (page.markdown && page.metadata && page.metadata.sourceURL) {
        const normalized = this.normalizeMarkdown(page.markdown, page.metadata.sourceURL);
        const hash = this.hashContent(normalized);
        if (options?.dedupe) {
          if (options.dedupe.has(hash)) {
            // Skip exact duplicate page content
            continue;
          }
          options.dedupe.add(hash);
        }
        const splitter = new MarkdownTextSplitter({
          chunkSize: 10000,
          chunkOverlap: 200,
        });
        const chunks = await splitter.splitText(normalized);
        // In-chunk level normalization / cleanup
        const cleanedChunks = chunks.map(c => this.normalizeChunk(c));
        const { processed, failed } = await this.typesenseService.generateAndStoreEmbedding(
          appName,
          page.metadata.sourceURL,
          cleanedChunks,
        );
        totalChunks += processed;
        totalFailed += failed;
        pageCount += 1;
      }
    }
    return { totalChunks, totalFailed, pageCount };
  }

  private async crawlWithCrawl4AIUsingLLM(url: string, appName: string): Promise<{ data: Array<{ markdown?: string; metadata?: { sourceURL?: string } }> } | null> {
    if (!this.crawl4ai) return null;

    const prompt = `Extract information that is most relevant for a Q&A assistant about ${appName}.`;

    try {
      // Try sitemap-driven multi-page extraction first
      const sitemapUrls = await this.discoverSitemapUrls(url);
      if (sitemapUrls && sitemapUrls.length) {
        console.log(`Discovered sitemap with ${sitemapUrls.length} URLs. Beginning multi-page Crawl4AI extraction (LLM filter).`);
        const pages: Array<{ markdown: string; metadata: { sourceURL: string } }> = [];
        const maxPerSite = Number(this.configService.get<string>('SITEMAP_MAX_URLS') || process.env.SITEMAP_MAX_URLS || 100);
        for (const pageUrl of sitemapUrls.slice(0, maxPerSite)) {
          try {
            const markdown = await this.crawl4ai.markdown({ url: pageUrl, filter: 'llm', query: prompt });
            if (typeof markdown === 'string' && markdown.trim()) {
              pages.push({ markdown, metadata: { sourceURL: pageUrl } });
            }
          } catch (pageErr) {
            console.warn(`Crawl4AI failed for ${pageUrl}:`, (pageErr as any)?.message || pageErr);
          }
        }
        if (pages.length) {
          return { data: pages };
        } else {
          console.warn('Sitemap discovered but no pages yielded markdown. Falling back to single URL.');
        }
      }

      // Single URL fallback (current behaviour)
      const markdown = await this.crawl4ai.markdown({ url, filter: 'llm', query: prompt });
      if (typeof markdown === 'string' && markdown.trim().length > 0) {
        return { data: [{ markdown, metadata: { sourceURL: url } }] };
      }
      throw new Error('Crawl4AI markdown() returned empty content after sitemap fallback');
    } catch (err) {
      console.error('Error calling Crawl4AI markdown LLM:', err);
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
            const { totalChunks, totalFailed, pageCount } = await this.processPages(resultLlm.data, appName, { dedupe: new Set() });
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
        const { totalChunks, totalFailed } = await this.processPages((result as any).data, appName, { dedupe: new Set() });
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

  /* --------------------------- Normalization Helpers --------------------------- */

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private normalizeMarkdown(raw: string, sourceURL?: string): string {
    let text = raw || '';
    // Remove UTF-8 BOM
    text = text.replace(/^\uFEFF/, '');
    // Remove frontmatter
    text = text.replace(/^---[\s\S]*?---\n/, '');
    // Remove HTML comments
    text = text.replace(/<!--([\s\S]*?)-->/g, '');
    // Remove scripts/styles blocks if any
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    // Collapse multiple blank lines
    text = text.replace(/\n{3,}/g, '\n\n');
    // Remove leading/trailing whitespace on each line
    text = text.split('\n').map(l => l.trimEnd()).join('\n');
    // Remove markdown image tags but keep alt text where available
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    // Strip tracking params from links (utm_*, ref, fbclid)
    text = text.replace(/\]\((https?:[^)]+)\)/g, (m, p1) => {
      try {
        const u = new URL(p1);
        const paramsToDelete: string[] = [];
        u.searchParams.forEach((_, k) => { if (/^(utm_|ref$|fbclid$)/i.test(k)) paramsToDelete.push(k); });
        paramsToDelete.forEach(k => u.searchParams.delete(k));
        return `](${u.toString().replace(/\/$/, '')})`;
      } catch { return m; }
    });
    // Deduplicate consecutive identical lines
    const lines = text.split('\n');
    const deduped: string[] = [];
    let prev = '';
    for (const l of lines) {
      if (l !== prev) deduped.push(l);
      prev = l;
    }
    text = deduped.join('\n');
    // Heuristic remove common boilerplate lines
    const boilerplatePatterns = [
      /copyright\s+\d{4}/i,
      /all rights reserved/i,
      /cookie( |-)policy/i,
      /terms of service/i,
      /privacy policy/i,
    ];
    text = text.split('\n').filter(l => !boilerplatePatterns.some(p => p.test(l))).join('\n');
    text = text.trim();
    return text;
  }

  private normalizeChunk(chunk: string): string {
    let c = chunk;
    // Collapse excessive whitespace inside chunk
    c = c.replace(/\s{2,}/g, ' ');
    // Ensure headings start on new line
    c = c.replace(/\s*^#+\s+/gm, m => m.trimStart());
    return c.trim();
  }
}
