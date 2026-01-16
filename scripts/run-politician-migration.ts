import pg from 'pg';
import fs from 'fs';
import dns from 'dns';

// Force IPv4 to avoid WSL IPv6 issues
dns.setDefaultResultOrder('ipv4first');

const projectRef = 'uhxjitayytkfbshdauar';
const password = process.argv[2] || 'rascaw-hehsEv-3nimdy';

const client = new pg.Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function run() {
  console.log('Connecting to Supabase database...');
  await client.connect();
  console.log('Connected!');

  const sqlPath = new URL('../supabase-politician-migration.sql', import.meta.url).pathname;
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Running migration...');
  await client.query(sql);
  console.log('Migration completed successfully!');

  // Verify tables were created
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE 'politician_%'
    ORDER BY table_name
  `);

  console.log('\nCreated tables:');
  result.rows.forEach((row) => console.log('  -', row.table_name));

  // Check views
  const viewResult = await client.query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
    AND table_name LIKE 'politician_%'
  `);

  if (viewResult.rows.length > 0) {
    console.log('\nCreated views:');
    viewResult.rows.forEach((row) => console.log('  -', row.table_name));
  }

  await client.end();
}

run().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
