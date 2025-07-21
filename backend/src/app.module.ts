import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestionModule } from './ingestion/ingestion.module';
import { ChromaDBIngestionModule } from './ingestion/chromadb-ingestion.module';
import { TypesenseService } from './typesense/typesense.service';
import { TypesenseModule } from './typesense/typesense.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), IngestionModule, ChromaDBIngestionModule, TypesenseModule, ChatModule],
  controllers: [AppController],
  providers: [AppService, TypesenseService],
})
export class AppModule {}
