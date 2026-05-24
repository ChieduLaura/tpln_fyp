import fs from 'fs/promises';
import path from 'path';
import { Client, ClientConfig } from 'pg';

async function getClient(): Promise<Client> {
  if (process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.DATABASE_URL } as ClientConfig);
  }

  const cfg: ClientConfig = {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    user: process.env.PGUSER || process.env.USER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
  };
  return new Client(cfg);
}

async function runMigration() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  console.log('Reading schema from', schemaPath);
  const sql = await fs.readFile(schemaPath, { encoding: 'utf8' });

  const client = await getClient();
  try {
    console.log('Connecting to Postgres...');
    await client.connect();
    console.log('Running migration...');
    // Run inside a transaction so partially-applied migrations rollback on error
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error('Unexpected error running migration:', err);
    process.exit(1);
  });
}

export { runMigration };
