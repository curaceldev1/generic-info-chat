import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class IngestDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  appName: string;
} 