import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { TypesenseModule } from 'src/typesense/typesense.module';

@Module({
  imports: [TypesenseModule],
  providers: [ChatService],
  controllers: [ChatController]
})
export class ChatModule {}
