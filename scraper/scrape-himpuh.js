/**
 * scrape-himpuh.js  (versi Supabase + auto-save bertahap)
 * ----------------------------------------------------------------------------
 * Mengambil data anggota dari direktori PUBLIK HIMPUH (himpuh.or.id),
 * menyimpan ke Supabase (real-time) + CSV/JSON sebagai backup lokal.
 *
 * CARA PAKAI:
 *   1) npm install              (dependensi ada di package.json)
 *   2) Set SUPABASE_URL dan SUPABASE_SERVICE_KEY di environment
 *   2) node scrape-himpuh.js   <- mulai / lanjut otomatis
 * ----------------------------------------------------------------------------
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');
const { createClient } = require('@supabase/supabase-js');

// ====================== KONFIGURASI ======================
const START_ID      = 1;
const END_ID        = 1500;
const DELAY_MS      = 2500;
const TIMEOUT_MS    = 15000;
const MAX_REDIRECTS = 2;
const SAVE_EVERY    = 10;

const ROOT_DIR      = path.resolve(__dirname, '..');
const OUTPUT_CSV    = path.join(ROOT_DIR, 'himpuh-travel.csv');
const OUTPUT_JSON   = path.join(ROOT_DIR, 'himpuh-travel.json');
const PROGRESS_FILE = path.join(ROOT_DIR, 'progress.json');

const FILTER_JABODETABEK = false;
const KOTA_JABODETABEK = [
  'jakarta', 'bekasi', 'depok', 'tangerang', 'bogor',
  'jakarta pusat', 'jakarta selatan', 'jakarta barat', 'jakarta timur', 'jakarta utara',
  'tangerang selatan', 'kota tangerang', 'kabupaten bogor', 'kota bogor', 'kota bekasi',
];
// =========================================================

const BASE    = 'https://himpuh.or.id/daftar-anggota/detail';
const sleep   = (ms) => new Promise((r) => setTimeout(r, ms));

// Supabase client (optional — falls back to file-only if not configured)
const SUPABASE_ENABLED = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const supabase = SUPABASE_ENABLED
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

function log(msg) { process.stdout.write(msg + '\n'); }

function logError(context, id, err) {
  const ts  = new Date().toISOString();
  const msg = err && err.message ? err.message : String(err);
  process.stderr.write(`[${ts}] ERROR id=${id} op=${context}: ${msg}\n`);
}

// ---------- helpers ----------

function getField($, label) {
  let val = '';
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim().toLowerCase();
      if (key.includes(label.toLowerCase())) val = $(cells[1]).text().trim();
    }
  });
  return val;
}

function isJabodetabek(alamat) {
  if (!alamat) return false;
  const a = alamat.toLowerCase();
  return KOTA_JABODETABEK.some((k) => a.includes(k));
}

function tebakKota(alamat) {
  if (!alamat) return '';
  const a     = alamat.toLowerCase();
  const found = KOTA_JABODETABEK.find((k) => a.includes(k));
  return found ? found.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

const PROVINSI_MAP = [
  [['jakarta pusat','jakarta selatan','jakarta barat','jakarta timur','jakarta utara','jakarta'], 'DKI Jakarta'],
  [['tangerang selatan','tangerang','serang','cilegon','lebak','pandeglang','banten'], 'Banten'],
  [['bekasi','depok','bogor','bandung','cimahi','sukabumi','tasikmalaya','cirebon','karawang','purwakarta','subang','garut','cianjur','majalengka','sumedang','indramayu','kuningan'], 'Jawa Barat'],
  [['semarang','solo','surakarta','magelang','pekalongan','tegal','salatiga','purwokerto','kudus','demak','wonosobo','purworejo','kebumen','cilacap','banyumas','klaten'], 'Jawa Tengah'],
  [['yogyakarta','yogya','sleman','bantul','kulon progo','gunung kidul'], 'DI Yogyakarta'],
  [['surabaya','malang','sidoarjo','gresik','pasuruan','probolinggo','batu','mojokerto','jombang','kediri','blitar','madiun','ngawi','bojonegoro','tuban','lamongan','jember','banyuwangi','situbondo','bondowoso','lumajang','pamekasan','sumenep','sampang','bangkalan'], 'Jawa Timur'],
  [['medan','binjai','tebing tinggi','pematangsiantar','sibolga','tanjungbalai','padangsidimpuan','deli serdang','langkat','sumut'], 'Sumatera Utara'],
  [['aceh','banda aceh','sabang','lhokseumawe','langsa'], 'Aceh'],
  [['padang','bukittinggi','payakumbuh','sawahlunto','solok','pariaman','padang panjang','sumbar'], 'Sumatera Barat'],
  [['pekanbaru','dumai','riau'], 'Riau'],
  [['batam','tanjungpinang','kepri','bintan','karimun'], 'Kepulauan Riau'],
  [['jambi'], 'Jambi'],
  [['palembang','lubuklinggau','prabumulih','pagaralam','baturaja','muara enim','sumsel'], 'Sumatera Selatan'],
  [['pangkalpinang','bangka','belitung'], 'Bangka Belitung'],
  [['bengkulu'], 'Bengkulu'],
  [['bandar lampung','metro lampung','lampung'], 'Lampung'],
  [['denpasar','badung','gianyar','tabanan','klungkung','karangasem','buleleng','jembrana','bali'], 'Bali'],
  [['mataram','lombok','sumbawa','bima','dompu','ntb'], 'Nusa Tenggara Barat'],
  [['kupang','ende','flores','maumere','waingapu','ntt'], 'Nusa Tenggara Timur'],
  [['pontianak','singkawang','ketapang','sanggau','sintang','kalbar'], 'Kalimantan Barat'],
  [['palangkaraya','sampit','pangkalan bun','kalteng'], 'Kalimantan Tengah'],
  [['banjarmasin','banjarbaru','martapura','kalsel'], 'Kalimantan Selatan'],
  [['samarinda','balikpapan','bontang','kutai','berau','sangatta','kaltim'], 'Kalimantan Timur'],
  [['tarakan','tanjung selor','nunukan','bulungan','kaltara'], 'Kalimantan Utara'],
  [['manado','bitung','tomohon','kotamobagu','minahasa','sulut'], 'Sulawesi Utara'],
  [['gorontalo'], 'Gorontalo'],
  [['palu','poso','tolitoli','banggai','morowali','sulteng'], 'Sulawesi Tengah'],
  [['makassar','parepare','palopo','bone','wajo','maros','gowa','takalar','jeneponto','bantaeng','bulukumba','sinjai','pinrang','barru','soppeng','sidrap','luwu','sulsel'], 'Sulawesi Selatan'],
  [['kendari','baubau','kolaka','konawe','sultra'], 'Sulawesi Tenggara'],
  [['mamuju','polewali','majene','pasangkayu','sulbar'], 'Sulawesi Barat'],
  [['ambon','maluku tengah','maluku'], 'Maluku'],
  [['ternate','tidore','sofifi','malut'], 'Maluku Utara'],
  [['manokwari','sorong','papua barat'], 'Papua Barat'],
  [['jayapura','merauke','timika','nabire','wamena','biak','papua'], 'Papua'],
];

function tebakProvinsi(alamat) {
  if (!alamat) return '';
  const a = alamat.toLowerCase();
  for (const [kws, prov] of PROVINSI_MAP) {
    if (kws.some((k) => a.includes(k))) return prov;
  }
  return '';
}

function bersihkanTelepon(raw) {
  if (!raw) return '';
  const match = raw.match(/[+]?[\d\s\-()]{7,}/);
  return match ? match[0].replace(/[\s\-()]/g, '').trim() : raw.trim();
}

function csvEscape(s) {
  const v = (s ?? '').toString().replace(/"/g, '""');
  return `"${v}"`;
}

// ---------- atomic file writes ----------

function atomicWrite(filePath, content, encoding) {
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, content, encoding);
  fs.renameSync(tmp, filePath);
}

// ---------- Supabase upsert ----------

async function upsertSupabase(data) {
  if (!supabase) return;
  const row = {
    id:              data.id,
    nama_perusahaan: data.nama_perusahaan || '',
    merek_dagang:    data.merek_dagang    || '',
    jenis_anggota:   data.jenis_anggota   || '',
    no_registrasi:   data.no_registrasi   || '',
    alamat:          data.alamat          || '',
    telepon:         data.telepon         || '',
    email:           data.email           || '',
    website:         data.website         || '',
    url_himpuh:      data.url_himpuh      || '',
    kota:            data.kota            || '',
  };
  const { error } = await supabase.from('himpuh_travel').upsert(row, { onConflict: 'id' });
  if (error) logError('upsertSupabase', data.id, error);
}

async function updateProgressSupabase(lastId, jumlah) {
  if (!supabase) return;
  const { error } = await supabase
    .from('scraper_progress')
    .upsert({ id: 1, last_id: lastId, jumlah, saved_at: new Date().toISOString() }, { onConflict: 'id' })
    .catch(() => ({ error: null }));
  if (error) logError('updateProgressSupabase', lastId, error);
}

// ---------- file saves (backup) ----------

function simpanCSV(hasil) {
  try {
    const header = [
      'No','Nama Perusahaan','Merek Dagang','Kota','Alamat',
      'Telepon/WA','Email','Website','Jenis','Link HIMPUH',
      'Status Follow-up','Catatan',
    ];
    const rows = hasil.map((d, i) => [
      i+1, d.nama_perusahaan, d.merek_dagang, d.kota, d.alamat,
      d.telepon, d.email, d.website, d.jenis_anggota, d.url_himpuh,
      'Belum dihubungi', '',
    ].map(csvEscape).join(','));
    atomicWrite(OUTPUT_CSV, '\uFEFF' + [header.map(csvEscape).join(','), ...rows].join('\n'), 'utf8');
  } catch (e) { logError('simpanCSV', 'n/a', e); }
}

function simpanJSON(hasil) {
  try { atomicWrite(OUTPUT_JSON, JSON.stringify(hasil, null, 2), 'utf8'); }
  catch (e) { logError('simpanJSON', 'n/a', e); }
}

function simpanProgress(lastId, jumlah) {
  try {
    atomicWrite(PROGRESS_FILE, JSON.stringify({ lastId, jumlah, savedAt: new Date().toISOString() }), 'utf8');
  } catch (e) { logError('simpanProgress', lastId, e); }
}

function muatProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE))
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch (e) { logError('muatProgress', 'n/a', e); }
  return null;
}

async function muatProgressDariSupabase() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('scraper_progress').select('*').eq('id', 1).single();
    if (data) return { lastId: data.last_id, jumlah: data.jumlah };
  } catch (_) {}
  return null;
}

async function muatHasilDariSupabase() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('himpuh_travel')
      .select('id,nama_perusahaan,merek_dagang,jenis_anggota,no_registrasi,alamat,telepon,email,website,url_himpuh,kota')
      .order('id', { ascending: true });
    if (error) { logError('muatHasilDariSupabase', 'n/a', error); return null; }
    return data || [];
  } catch (e) { logError('muatHasilDariSupabase', 'n/a', e); return null; }
}

function muatHasilLama() {
  try {
    if (fs.existsSync(OUTPUT_JSON))
      return JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
  } catch (e) { logError('muatHasilLama', 'n/a', e); }
  return [];
}

// ---------- scrape satu ID ----------

async function scrapeOne(id) {
  const url = `${BASE}/${id}`;
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (riset-kontak-travel; follow-up manual)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      maxRedirects: MAX_REDIRECTS,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const $ = cheerio.load(res.data);
    const nama = getField($, 'Nama Perusahaan');
    if (!nama) return null;

    const data = {
      id,
      nama_perusahaan: nama,
      merek_dagang:    getField($, 'Merek Dagang'),
      jenis_anggota:   getField($, 'Jenis Anggota'),
      no_registrasi:   getField($, 'No Registrasi'),
      alamat:          getField($, 'Kantor Pusat'),
      telepon:         bersihkanTelepon(getField($, 'Nomor Telepon')),
      email:           getField($, 'Email'),
      website:         getField($, 'Website'),
      url_himpuh:      url,
    };
    data.kota     = tebakKota(data.alamat);
    data.provinsi = tebakProvinsi(data.alamat);
    return data;
  } catch (e) {
    const code = e.code || (e.response && e.response.status) || 'ERR';
    logError(`scrapeOne(${code})`, id, e);
    return null;
  }
}

// ---------- graceful shutdown ----------

let _hasil        = [];
let _lastSavedId  = null;
let _shuttingDown = false;

function handleShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  log(`\n[scraper] ${signal} — menyimpan progress dan berhenti…`);
  if (_lastSavedId !== null) {
    simpanCSV(_hasil);
    simpanJSON(_hasil);
    simpanProgress(_lastSavedId, _hasil.length);
    log(`[scraper] Progress disimpan: ${_hasil.length} travel, ID terakhir ${_lastSavedId}`);
  }
  process.exit(0);
}
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT',  () => handleShutdown('SIGINT'));

// ---------- main ----------

async function main() {
  if (SUPABASE_ENABLED) {
    log('🔌 Supabase aktif — data akan disimpan real-time ke cloud.');
  } else {
    log('⚠️  Supabase tidak dikonfigurasi — hanya simpan ke file lokal.');
  }

  // Muat progress: utamakan Supabase, fallback file
  let prog = null;
  if (SUPABASE_ENABLED) {
    prog = await muatProgressDariSupabase();
    if (!prog) prog = muatProgress();
  } else {
    prog = muatProgress();
  }

  // Muat data lama: utamakan Supabase, fallback file
  let hasil = [];
  if (SUPABASE_ENABLED) {
    const fromDB = await muatHasilDariSupabase();
    hasil = fromDB !== null ? fromDB : muatHasilLama();
    log(`📦 Loaded ${hasil.length} records dari ${fromDB !== null ? 'Supabase' : 'file lokal'}.`);
  } else {
    hasil = muatHasilLama();
    log(`📦 Loaded ${hasil.length} records dari file lokal.`);
  }

  const startId = prog ? prog.lastId + 1 : START_ID;
  _hasil = hasil;

  if (prog) {
    log(`▶ Melanjutkan dari ID ${startId} (sudah ${hasil.length} travel tersimpan).`);
  } else {
    log(`▶ Mulai baru — ID ${START_ID}–${END_ID}, jeda ${DELAY_MS}ms/req.`);
  }
  log(`  Auto-save file lokal setiap ${SAVE_EVERY} data terkumpul.\n`);

  let dicek        = 0;
  let baruDikumpul = 0;

  for (let id = startId; id <= END_ID; id++) {
    if (_shuttingDown) break;

    const data = await scrapeOne(id);
    dicek++;
    _lastSavedId = id;

    if (data) {
      const lolos = !FILTER_JABODETABEK || isJabodetabek(data.alamat);
      if (lolos) {
        hasil.push(data);
        baruDikumpul++;
        log(`✓ [${id}] ${data.nama_perusahaan} — ${data.kota || '?'} — ${data.telepon || 'no telp'}`);

        // Simpan ke Supabase langsung (real-time)
        await upsertSupabase(data);

        if (baruDikumpul % SAVE_EVERY === 0) {
          simpanCSV(hasil);
          simpanJSON(hasil);
          simpanProgress(id, hasil.length);
          await updateProgressSupabase(id, hasil.length);
          log(`  💾 Auto-saved ${hasil.length} travel (Supabase + file lokal)`);
        }
      } else {
        log(`· [${id}] ${data.nama_perusahaan} (luar Jabodetabek, dilewati)`);
      }
    }

    if (dicek % 50 === 0) {
      log(`  ── ${dicek} ID dicek, ${hasil.length} travel terkumpul ──`);
      simpanProgress(id, hasil.length);
      await updateProgressSupabase(id, hasil.length);
    }

    if (!_shuttingDown) await sleep(DELAY_MS);
  }

  if (!_shuttingDown) {
    simpanCSV(hasil);
    simpanJSON(hasil);
    simpanProgress(END_ID, hasil.length);
    await updateProgressSupabase(END_ID, hasil.length);

    log(`\n✅ Selesai! ${hasil.length} travel ${FILTER_JABODETABEK ? 'Jabodetabek ' : ''}tersimpan.`);
    log(`  ☁️  Supabase: ${SUPABASE_ENABLED ? 'aktif' : 'tidak aktif'}`);
    log(`  📄 ${OUTPUT_CSV}`);
    log(`  📄 ${OUTPUT_JSON}`);
    log('\nIngat: follow-up manual & personal. Jangan blast spam. Hormati UU PDP.');

    try { if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE); }
    catch (e) { logError('unlinkProgress', 'n/a', e); }
  }
}

main().catch((e) => { logError('main', 'n/a', e); process.exit(1); });
