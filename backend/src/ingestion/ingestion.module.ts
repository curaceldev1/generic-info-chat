import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { TypesenseModule } from 'src/typesense/typesense.module';

@Module({
  imports: [TypesenseModule],
  providers: [IngestionService],
  controllers: [IngestionController]
})
export class IngestionModule {}
