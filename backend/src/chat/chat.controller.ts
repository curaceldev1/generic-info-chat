import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';
import { randomUUID } from 'crypto';

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() chatDto: ChatDto) {
    const { message, appName, baseUrl, history } = chatDto;
    const requestId = randomUUID();

    this.logger.log(
      `request.start requestId=${requestId} appName=${appName} baseUrl=${baseUrl ?? 'n/a'} messageChars=${message?.length ?? 0} historyLen=${history?.length ?? 0}`,
    );

    try {
      const result = await this.chatService.ask(
        message,
        appName,
        baseUrl,
        history,
        requestId,
      );
      this.logger.log(`request.end requestId=${requestId}`);
      return result;
    } catch (error) {
      this.logger.error(`request.error requestId=${requestId}`, error as any);
      throw error;
    }
  }
}
