import { Module } from '@nestjs/common';
import { ChromaDBIngestionService } from './chromadb-ingestion.service';
import { ChromaDBIngestionController } from './chromadb-ingestion.controller';

@Module({
  providers: [ChromaDBIngestionService],
  controllers: [ChromaDBIngestionController],
  exports: [ChromaDBIngestionService],
})
export class ChromaDBIngestionModule {} 