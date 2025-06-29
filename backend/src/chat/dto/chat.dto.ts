import { IsString, MinLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsString()
  baseUrl: string;
} 