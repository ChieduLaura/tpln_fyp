"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = runMigration;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
async function getClient() {
    if (process.env.DATABASE_URL) {
        return new pg_1.Client({
            connectionString: process.env.DATABASE_URL,
            options: "-c search_path=tpln,public"
        });
    }
    const cfg = {
        host: process.env.PGHOST || 'localhost',
        port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
        user: process.env.PGUSER || process.env.USER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE || 'postgres',
        options: "-c search_path=tpln,public"
    };
    return new pg_1.Client(cfg);
}
async function runMigration() {
    const schemaPath = path_1.default.join(__dirname, 'schema.sql');
    console.log('Reading schema from', schemaPath);
    const sql = await promises_1.default.readFile(schemaPath, { encoding: 'utf8' });
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
    }
    catch (err) {
        console.error('Migration failed:', err);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackErr) {
            console.error('Rollback failed:', rollbackErr);
        }
        process.exitCode = 1;
    }
    finally {
        await client.end();
    }
}
if (require.main === module) {
    runMigration().catch((err) => {
        console.error('Unexpected error running migration:', err);
        process.exit(1);
    });
}
