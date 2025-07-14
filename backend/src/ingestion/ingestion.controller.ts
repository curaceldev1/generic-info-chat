import { Controller, Post, Body } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestDto } from './dto/ingest.dto';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  async ingest(@Body() ingestDto: IngestDto) {
    const { url, appName } = ingestDto;
    return this.ingestionService.crawlUrl(url, appName);
  }
}
