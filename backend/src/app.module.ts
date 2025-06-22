import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestionModule } from './ingestion/ingestion.module';
import { TypesenseService } from './typesense/typesense.service';
import { TypesenseModule } from './typesense/typesense.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), IngestionModule, TypesenseModule],
  controllers: [AppController],
  providers: [AppService, TypesenseService],
})
export class AppModule {}
