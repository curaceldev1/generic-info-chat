import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ChromaDBIngestDto {
  text: string;
  collection_name: string;
  metadata: Record<string, any>;
  chunk_size: number;
  chunk_overlap: number;
}

@Injectable()
export class ChromaDBIngestionService {
  private readonly chromaDBUrl: string;

  constructor(private configService: ConfigService) {
    this.chromaDBUrl = this.configService.get<string>('CHROMADB_URL') || 'http://3.95.37.190:8000';
  }

  async ingestText(ingestDto: ChromaDBIngestDto): Promise<any> {
    try {
      const response = await axios.post(
        `${this.chromaDBUrl}/ingest-text`,
        ingestDto,
        {
          headers: {
            'Content-Type': 'application/json',
            'accept': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error ingesting text to ChromaDB:', error);
      throw error;
    }
  }

  async ingestFromFirecrawl(
    text: string,
    collectionName: string,
    metadata: Record<string, any> = {},
    chunkSize: number = 1000,
    chunkOverlap: number = 200
  ): Promise<any> {
    const ingestDto: ChromaDBIngestDto = {
      text,
      collection_name: collectionName,
      metadata,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
    };

    return this.ingestText(ingestDto);
  }
} 