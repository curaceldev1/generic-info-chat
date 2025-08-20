import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IngestionService } from './ingestion.service';

@Processor('ingestion')
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly ingestionService: IngestionService) {}

  @Process('crawl')
  async handleCrawl(job: Job<{ url: string; appName: string }>) {
    const { url, appName } = job.data;
    this.logger.log(`Starting ingestion job ${job.id} for app '${appName}': ${url}`);
    try {
      const result = await this.ingestionService.crawlUrl(url, appName);
      this.logger.log(`Completed ingestion job ${job.id}: ${result?.message ?? 'done'}`);
      return result;
    } catch (error) {
      this.logger.error(`Ingestion job ${job.id} failed`, error as any);
      throw error;
    }
  }
}


