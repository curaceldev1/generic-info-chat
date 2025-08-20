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
    const trace = requestId.slice(0, 4);

    this.logger.log(
      `Received chat for app '${appName}' (baseUrl: ${baseUrl ?? 'n/a'}). Message: '${message}'. History: ${history?.length ?? 0}. [trace ${trace}]`,
    );

    try {
      const result = await this.chatService.ask(
        message,
        appName,
        baseUrl,
        history,
        requestId,
      );
      this.logger.log(`Chat completed successfully. [trace ${trace}]`);
      return result;
    } catch (error) {
      this.logger.error(
        `Chat failed: ${(error as any)?.message ?? error}. [trace ${trace}]`,
        error as any,
      );
      throw error;
    }
  }
}
