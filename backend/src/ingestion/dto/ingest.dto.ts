import { IsString, IsUrl } from 'class-validator';

export class IngestDto {
  @IsString()
  @IsUrl()
  url: string;
} 