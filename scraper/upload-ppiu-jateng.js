const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const data = JSON.parse(fs.readFileSync(__dirname + '/ppiu-jateng-final.json', 'utf8'));
  console.log(`Uploading ${data.length} records (ID ${data[0].id}–${data[data.length-1].id})...`);

  const BATCH = 50;
  let done = 0;
  let errors = 0;

  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    const { error } = await supabase
      .from('himpuh_travel')
      .upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Batch ${i/BATCH + 1} ERROR:`, error.message);
      errors++;
    } else {
      done += batch.length;
      console.log(`✓ Upserted ${done}/${data.length}`);
    }
  }

  if (errors === 0) {
    console.log(`\n✅ Done! ${done} records berhasil diupload ke Supabase.`);
  } else {
    console.log(`\n⚠️  Selesai dengan ${errors} error. ${done} records berhasil.`);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
