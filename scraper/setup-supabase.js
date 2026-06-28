const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Connecting to Supabase:', process.env.SUPABASE_URL);

  // Test connection & check table exists by trying a select
  const { error: testErr } = await supabase.from('himpuh_travel').select('id').limit(1);
  if (testErr && testErr.code === '42P01') {
    console.error('Table himpuh_travel does not exist yet.');
    console.log('\nBuat tabel ini di Supabase Dashboard → SQL Editor:\n');
    console.log(`
CREATE TABLE himpuh_travel (
  id INTEGER PRIMARY KEY,
  nama_perusahaan TEXT,
  merek_dagang TEXT,
  jenis_anggota TEXT,
  no_registrasi TEXT,
  alamat TEXT,
  telepon TEXT,
  email TEXT,
  website TEXT,
  url_himpuh TEXT,
  kota TEXT,
  status_followup TEXT DEFAULT 'Belum dihubungi',
  catatan TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
    `);
    process.exit(2);
  } else if (testErr) {
    console.error('Connection error:', testErr.message);
    process.exit(1);
  }

  console.log('Table exists. Loading local data...');

  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'himpuh-travel.json'), 'utf8'));
  console.log(`Loaded ${data.length} records from JSON`);

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH).map(d => ({
      id: d.id,
      nama_perusahaan: d.nama_perusahaan || '',
      merek_dagang: d.merek_dagang || '',
      jenis_anggota: d.jenis_anggota || '',
      no_registrasi: d.no_registrasi || '',
      alamat: d.alamat || '',
      telepon: d.telepon || '',
      email: d.email || '',
      website: d.website || '',
      url_himpuh: d.url_himpuh || '',
      kota: d.kota || '',
    }));
    const { error } = await supabase.from('himpuh_travel').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Batch ${i}-${i+BATCH} error:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\rUpserted ${inserted}/${data.length}...`);
    }
  }

  console.log(`\nDone! ${inserted} records upserted.`);
  const { count } = await supabase.from('himpuh_travel').select('*', { count: 'exact', head: true });
  console.log(`Verified: ${count} rows in himpuh_travel.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
