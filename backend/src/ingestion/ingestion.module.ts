import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { TypesenseModule } from 'src/typesense/typesense.module';
import { BullModule } from '@nestjs/bull';
import { IngestionProcessor } from './ingestion.processor';

@Module({
  imports: [TypesenseModule, BullModule.registerQueue({ name: 'ingestion' })],
  providers: [IngestionService, IngestionProcessor],
  controllers: [IngestionController]
})
export class IngestionModule {}
