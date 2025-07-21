import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as TypesenseClient } from 'typesense';
import OpenAI from 'openai';
import { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { SearchParams } from 'typesense/lib/Typesense/Documents';


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
        console.log(`Collection '${collectionName}' not found. Creating it...`);
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
      console.log(`Successfully created collection '${collectionName}'`);
    } catch (error) {
      console.error(`Failed to create collection '${collectionName}':`, error);
      
      // If collection already exists, that's fine
      if (error.message?.includes('already exists') || error.toString().includes('already exists')) {
        console.log(`Collection '${collectionName}' already exists, continuing...`);
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
      console.error(`Failed to index document in collection '${collectionName}':`, error);
      throw error;
    }
  }

  async generateAndStoreEmbedding(
    collectionName: string,
    source: string,
    chunks: string[],
  ): Promise<void> {
    for (const chunk of chunks) {
      try {
        console.log('Generating embedding for chunk:', chunk);
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk,
        });

        const embedding = response.data[0].embedding;
        await this.indexDocument(collectionName, source, chunk, embedding);
      } catch (error) {
        console.error(`Error processing chunk for collection '${collectionName}':`, error);
        
        // If it's a collection-related error, try to provide more context
        if (error.message?.includes('Collection not found') || error.toString().includes('Collection not found')) {
          console.error(`Collection '${collectionName}' was not found and could not be created automatically.`);
        }
        
        // Don't throw here to continue processing other chunks
        // throw error; // Uncomment if you want to stop on first error
      }
    }
  }

  async search(collectionName: string, queryVector: number[], baseUrl?: string) {
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

    if (baseUrl) {
      commonSearchParams.filter_by = `source:=${baseUrl}`;
    }

    const searchResult = await this.client.multiSearch.perform(
      searchRequests,
      commonSearchParams,
    );
    return (searchResult.results[0] as any)?.hits || [];
  }
}
