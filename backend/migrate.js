import Typesense from 'typesense';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const sourceCollectionName = args[0];
  const destCollectionName = args[1];
  const deleteSource = args.includes('--delete-source');

  if (!sourceCollectionName || !destCollectionName) {
    console.error('Usage: node migrate.js <source_collection_name> <destination_collection_name> [--delete-source]');
    process.exit(1);
  }

  console.log(`Starting migration from '${sourceCollectionName}' to '${destCollectionName}'...`);

  const client = new Typesense.Client({
    nodes: [{
      host: process.env.TYPESENSE_HOST,
      port: process.env.TYPESENSE_PORT,
      protocol: process.env.TYPESENSE_PROTOCOL,
    }],
    apiKey: process.env.TYPESENSE_API_KEY,
    connectionTimeoutSeconds: 5,
  });

  try {
    // 1. Retrieve schema from the source collection
    console.log(`1. Fetching schema from '${sourceCollectionName}'...`);
    const sourceSchema = await client.collections(sourceCollectionName).retrieve();

    // 2. Create the destination collection with the same schema
    console.log(`2. Creating destination collection '${destCollectionName}'...`);
    const { name, fields, default_sorting_field } = sourceSchema;
    await client.collections().create({
      name: destCollectionName,
      fields,
      default_sorting_field,
    });
    console.log(`   Collection '${destCollectionName}' created successfully.`);

    // 3. Export documents from the source and import into the destination
    console.log('3. Exporting and importing documents...');
    const documents = await client.collections(sourceCollectionName).documents().export();
    
    if (documents.length === 0) {
        console.log('   Source collection is empty. Nothing to import.');
    } else {
        const results = await client.collections(destCollectionName).documents().import(documents);
        const failedItems = results.split('\n').map(r => JSON.parse(r)).filter(item => !item.success);
        
        if (failedItems.length > 0) {
            console.error(`   ${failedItems.length} documents failed to import.`);
            console.error('   Aborting migration.');
            console.error('Failed items:', failedItems);
            process.exit(1);
        } else {
            console.log(`   Successfully imported all documents.`);
        }
    }

    // 4. Optionally delete the source collection
    if (deleteSource) {
      console.log(`4. Deleting source collection '${sourceCollectionName}'...`);
      await client.collections(sourceCollectionName).delete();
      console.log(`   Source collection deleted.`);
    }

    console.log('\nMigration completed successfully! 🎉');

  } catch (error) {
    console.error('\nAn error occurred during migration:');
    console.error(error);
    process.exit(1);
  }
}

main(); 