import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestionModule } from './ingestion/ingestion.module';
import { TypesenseService } from './typesense/typesense.service';
import { TypesenseModule } from './typesense/typesense.module';
import { ChatModule } from './chat/chat.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
          port: Number(config.get<string>('REDIS_PORT') ?? 6379),
          password: config.get<string>('REDIS_PASSWORD') ?? undefined,
        },
      }),
      inject: [ConfigService],
    }),
    IngestionModule,
    TypesenseModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, TypesenseService],
})
export class AppModule {}
