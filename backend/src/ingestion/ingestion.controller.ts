import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestDto } from './dto/ingest.dto';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  @HttpCode(202)
  async ingest(@Body() ingestDto: IngestDto) {
    const { url, appName } = ingestDto;
    const job = await this.ingestionService.enqueueCrawl(url, appName);
    return { message: 'Ingestion started', status: 'queued', jobId: job.id };
  }
}
