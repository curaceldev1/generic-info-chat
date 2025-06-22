import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as TypesenseClient } from 'typesense';
import OpenAI from 'openai';
import { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { SearchParams } from 'typesense/lib/Typesense/Documents';

export const DOCS_COLLECTION = 'docs';

@Injectable()
export class TypesenseService implements OnModuleInit {
  private client: TypesenseClient;
  private openai: OpenAI;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const typesenseHost = this.configService.get<string>('TYPESENSE_HOST');
    const typesensePort = this.configService.get<number>('TYPESENSE_PORT');
    const typesenseProtocol =
      this.configService.get<string>('TYPESENSE_PROTOCOL');
    const typesenseApiKey = this.configService.get<string>('TYPESENSE_API_KEY');
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (
      !typesenseHost ||
      !typesensePort ||
      !typesenseProtocol ||
      !typesenseApiKey ||
      !openaiApiKey
    ) {
      throw new Error(
        'Missing required environment variables for Typesense or OpenAI.',
      );
    }

    this.client = new TypesenseClient({
      nodes: [
        {
          host: typesenseHost,
          port: typesensePort,
          protocol: typesenseProtocol,
        },
      ],
      apiKey: typesenseApiKey,
      connectionTimeoutSeconds: 2,
    });

    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    this.ensureCollectionExists();
  }

  private async ensureCollectionExists() {
    try {
      await this.client.collections(DOCS_COLLECTION).retrieve();
      console.log(`Collection '${DOCS_COLLECTION}' already exists.`);
    } catch (error) {
      if (error.httpStatus === 404) {
        console.log(`Collection '${DOCS_COLLECTION}' not found, creating...`);
        await this.createCollection();
      } else {
        console.error('Error checking for collection:', error);
      }
    }
  }

  private async createCollection() {
    const schema: CollectionCreateSchema = {
      name: DOCS_COLLECTION,
      fields: [
        { name: 'id', type: 'string' },
        { name: 'text', type: 'string' },
        { name: 'embedding', type: 'float[]', num_dim: 1536 },
        { name: 'source', type: 'string' },
      ],
    };

    try {
      await this.client.collections().create(schema);
      console.log(`Collection '${DOCS_COLLECTION}' created.`);
    } catch (error) {
      console.error('Error creating collection:', error);
    }
  }

  async indexDocument(
    source: string,
    text: string,
    embedding: number[],
  ): Promise<any> {
    const document = {
      id: Buffer.from(`${source}-${text}`).toString('base64'),
      source,
      text,
      embedding,
    };

    try {
      return await this.client
        .collections(DOCS_COLLECTION)
        .documents()
        .upsert(document);
    } catch (error) {
      console.error('Error indexing document:', error);
      throw error;
    }
  }

  async generateAndStoreEmbedding(
    source: string,
    chunks: string[],
  ): Promise<void> {
    for (const chunk of chunks) {
      try {
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk,
        });

        const embedding = response.data[0].embedding;
        await this.indexDocument(source, chunk, embedding);
      } catch (error) {
        console.error('Error processing chunk:', error);
      }
    }
  }

  async search(queryVector: number[]) {
    const searchRequests = {
      searches: [
        {
          collection: DOCS_COLLECTION,
          q: '*',
          vector_query: `embedding:([${queryVector.join(',')}], k: 5)`,
        },
      ],
    };

    const commonSearchParams = {
      query_by: 'embedding',
      include_fields: 'text,source',
      per_page: 5,
    };

    try {
      const searchResult = await this.client.multiSearch.perform(
        searchRequests,
        commonSearchParams,
      );
      return (searchResult.results[0] as any)?.hits || [];
    } catch (error) {
      console.error('Error searching in Typesense:', error);
      throw error;
    }
  }
}
