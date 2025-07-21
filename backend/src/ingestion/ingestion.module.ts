import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { TypesenseModule } from 'src/typesense/typesense.module';
import { ChromaDBIngestionModule } from './chromadb-ingestion.module';

@Module({
  imports: [TypesenseModule, ChromaDBIngestionModule],
  providers: [IngestionService],
  controllers: [IngestionController]
})
export class IngestionModule {}
