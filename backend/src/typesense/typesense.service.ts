import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as TypesenseClient } from 'typesense';
import OpenAI from 'openai';
import { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { SearchParams } from 'typesense/lib/Typesense/Documents';


@Injectable()
export class TypesenseService implements OnModuleInit {
  private client: TypesenseClient;
  private openai: OpenAI;
  private readonly logger = new Logger(TypesenseService.name);

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
  }

  private async ensureCollectionExists(collectionName: string) {
    try {
      await this.client.collections(collectionName).retrieve();
    } catch (error) {
      // Check for 404 status or "Collection not found" message
      if (
        error.httpStatus === 404 || 
        error.message?.includes('Collection not found') ||
        error.toString().includes('Collection not found')
      ) {
        this.logger.warn(`collection.missing name=${collectionName} action=create`);
        await this.createCollection(collectionName);
      } else {
        throw error;
      }
    }
  }

  private async createCollection(collectionName: string) {
    const schema: CollectionCreateSchema = {
      name: collectionName,
      fields: [
        { name: 'id', type: 'string' },
        { name: 'text', type: 'string' },
        { name: 'embedding', type: 'float[]', num_dim: 1536 },
        { name: 'source', type: 'string', facet: true },
      ],
    };

    try {
      await this.client.collections().create(schema);
      this.logger.log(`collection.created name=${collectionName}`);
    } catch (error) {
      this.logger.error(`collection.create.error name=${collectionName}`, error as any);
      
      // If collection already exists, that's fine
      if (error.message?.includes('already exists') || error.toString().includes('already exists')) {
        this.logger.log(`collection.exists name=${collectionName}`);
        return;
      }
      
      throw error;
    }
  }

  async indexDocument(
    collectionName: string,
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
      await this.ensureCollectionExists(collectionName);
      return await this.client
        .collections(collectionName)
        .documents()
        .upsert(document);
    } catch (error) {
      this.logger.error(`index.error collection=${collectionName}`, error as any);
      throw error;
    }
  }

  async generateAndStoreEmbedding(
    collectionName: string,
    source: string,
    chunks: string[],
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    for (const chunk of chunks) {
      try {
        this.logger.log('embed.chunk.start');
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk,
        });

        const embedding = response.data[0].embedding;
        await this.indexDocument(collectionName, source, chunk, embedding);
        processed += 1;
      } catch (error) {
        this.logger.error(`embed.chunk.error collection=${collectionName}`, error as any);
        
        // If it's a collection-related error, try to provide more context
        if (error.message?.includes('Collection not found') || error.toString().includes('Collection not found')) {
          this.logger.error(`collection.not_found name=${collectionName}`);
        }
        failed += 1;
      }
    }
    return { processed, failed };
  }

  async search(collectionName: string, queryVector: number[], baseUrl?: string, requestId?: string) {
    const start = Date.now();
    const trace = requestId ? requestId.slice(0, 4) : '----';
    this.logger.log(`Searching Typesense in '${collectionName}' with vector query… [trace ${trace}]`);
    await this.ensureCollectionExists(collectionName);
    const searchRequests = {
      searches: [
        {
          collection: collectionName,
          q: '*',
          vector_query: `embedding:([${queryVector.join(',')}], k: 5)`,
        },
      ],
    };

    const commonSearchParams: SearchParams = {
      query_by: 'embedding',
      include_fields: 'text,source',
      per_page: 5,
    };

    const searchResult = await this.client.multiSearch.perform(
      searchRequests,
      commonSearchParams,
    );
    const hits = (searchResult.results[0] as any)?.hits || [];
    this.logger.log(`Typesense search finished with ${hits.length} hits in ${Date.now() - start}ms. [trace ${trace}]`);
    return hits;
  }
}
