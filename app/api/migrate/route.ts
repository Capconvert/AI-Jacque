import { sql } from '@vercel/postgres';

const POCS_BY_CLIENT: Record<string, string[]> = {
  'Boarderie': ['Lanie', 'Lexi'],
  'BOD': ['Matt', 'Jeff'],
  'FEIT': ['Natasha', 'Hal'],
  'Glamsquad': ['Dave', 'Simona'],
  'Gratz': ['Courtney', 'Jen', 'Kat'],
  'Jouer': ['Nicollette'],
  'Mingle': ['Kristin'],
  'Monsieur Marcel': ['Tiffany', 'Craig', 'Givy'],
  'MPH': ['Coco', 'Marissa'],
  'Poop Bags': ['Paul', 'Rubin'],
  'RentRedi': ['Crystal', 'Jen', 'Kelly'],
  'Splash': ['Daniel', 'Maros'],
  'Topicals': ['Helena'],
  'Vinyl': ['German'],
  '12th Tribe': ['Christoper', 'Demi'],
  'Bedrosians': ['Gary'],
  'De Soi': ['Karimah'],
  '4EY': ['Kylee', 'Dan', 'James'],
  'Ceremonia': ['Heidi', 'Francesca'],
  'Certa': ['Peyton', 'Theo', 'Jag'],
  'Chill Paws': ['Tim', 'Jay'],
  'Nordic Catch': ['Julian'],
  'TC2GO': ['Amrit', 'Aks'],
  'Assist': ['Stephen', 'TJ'],
  'Feno': ['Brandon', 'Greg'],
  'Brochu Walker': ['Leanna', 'Sarah'],
  'Decibel Hair': ['Michael'],
  'Soil Connect': ['Jonathan'],
  'EBY': ['Elizabeth', 'Ben Falk'],
  'Harbor': ['Sullivan', 'Jordan'],
  'Sol Place': ['Sean'],
  'Standard Procedure': ['Zepha'],
  'Vampr': [],
  'FTL': ['Ryan', 'Xander'],
  'Numin': ['Brandon', 'Michelle'],
  'Deko': ['Michael'],
  'Lumio': ['Angie'],
  'ADV': ['Lavie', 'Maybelline'],
  'Clean Eatz Kitchen': ['Katherine', 'Jason'],
  'DoggieLawn': [],
  'Gleamin': [],
  'Wellnesse': [],
  'Homecourt': ['Allison'],
  'Bark Potty': ['Vale'],
  'ALP': ['Harlan', 'Joshua'],
  'SCW': ['Natalie'],
  'Sully': [],
  'Wiesmade': ['Nic'],
  'KittyLawn': [],
  'FIH': ['Tiare', 'Janelle'],
  'Partnered Process': [],
  'Local Cart': ['Max'],
  'Elizabeth Axelgard': ['Elizabeth', 'Lauren'],
  'ChargeFUZE': ['Morgan'],
  'TMT': ['Nash'],
  'No Reservations': ['Krista', 'Sabrina'],
  'TruPaths': [],
};

export async function POST() {
  try {
    await sql`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS summary TEXT
    `;

    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ahrefs_project_id INT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ga4_property_id VARCHAR(50)`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_ads_customer_id VARCHAR(20)`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS pocs TEXT[] NOT NULL DEFAULT '{}'`;

    await sql`CREATE TABLE IF NOT EXISTS jacque_comms (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      client_id INT REFERENCES clients(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      comm_date TIMESTAMP,
      file_mtime TIMESTAMP,
      content_hash VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE INDEX IF NOT EXISTS jacque_comms_client_idx ON jacque_comms(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS jacque_comms_created_idx ON jacque_comms(created_at DESC)`;

    const seedResults: Array<{ client: string; matched: boolean; pocs: string[] }> = [];
    for (const [clientName, pocs] of Object.entries(POCS_BY_CLIENT)) {
      const result = await sql`
        UPDATE clients
        SET pocs = ${pocs as unknown as string}::TEXT[]
        WHERE LOWER(name) = LOWER(${clientName})
        RETURNING id
      `;
      seedResults.push({ client: clientName, matched: (result.rowCount ?? 0) > 0, pocs });
    }

    const unmatched = seedResults.filter((r) => !r.matched).map((r) => r.client);

    return Response.json({
      success: true,
      message: 'Database migrated successfully',
      pocs_seeded: seedResults.length - unmatched.length,
      pocs_unmatched: unmatched,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
