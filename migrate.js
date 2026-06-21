import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:jasnjsauhdnsduhushdu@db.zlyqgkppppcwdkkxleaz.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");

    const query = `
      CREATE TABLE IF NOT EXISTS station_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        station_id TEXT NOT NULL,
        is_working BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );

      -- Optional: Create index on station_id for faster lookups
      CREATE INDEX IF NOT EXISTS idx_station_reports_station_id ON station_reports(station_id);

      -- Supabase RLS (Row Level Security)
      ALTER TABLE station_reports ENABLE ROW LEVEL SECURITY;
      
      -- Allow anon access to read and insert (since this is crowdsourced without strict login right now)
      DROP POLICY IF EXISTS "Allow anon read" ON station_reports;
      CREATE POLICY "Allow anon read" ON station_reports FOR SELECT USING (true);
      
      DROP POLICY IF EXISTS "Allow anon insert" ON station_reports;
      CREATE POLICY "Allow anon insert" ON station_reports FOR INSERT WITH CHECK (true);
    `;

    await client.query(query);
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

run();
