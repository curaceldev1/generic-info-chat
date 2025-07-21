import { Controller, Post, Body } from '@nestjs/common';
import { ChromaDBIngestionService, ChromaDBIngestDto } from './chromadb-ingestion.service';

@Controller('chromadb-ingestion')
export class ChromaDBIngestionController {
  constructor(private readonly chromaDBIngestionService: ChromaDBIngestionService) {}

  @Post('ingest-text')
  async ingestText(@Body() ingestDto: ChromaDBIngestDto) {
    return this.chromaDBIngestionService.ingestText(ingestDto);
  }
} 