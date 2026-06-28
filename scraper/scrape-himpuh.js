/**
 * scrape-himpuh.js  (versi auto-save bertahap)
 * ----------------------------------------------------------------------------
 * Mengambil data anggota dari direktori PUBLIK HIMPUH (himpuh.or.id),
 * lalu menyimpan ke CSV untuk follow-up MANUAL satu per satu.
 *
 * FITUR AUTO-SAVE:
 *  - Data disimpan ke CSV & JSON setiap SAVE_EVERY data berhasil dikumpulkan.
 *  - Progress (ID terakhir) disimpan ke progress.json agar bisa dilanjut
 *    jika proses terhenti di tengah jalan.
 *  - Jalankan ulang script → otomatis lanjut dari ID terakhir.
 *
 * PRINSIP SOPAN & BERTANGGUNG JAWAB:
 *  - Direktori ini publik & memang ditujukan agar anggota dikontak.
 *  - Script memberi JEDA antar request (default 2.5 detik).
 *  - Pakai data ini HANYA untuk follow-up personal yang relevan.
 *  - Hormati UU PDP & etika. Jangan blast spam massal.
 *
 * CARA PAKAI:
 *   1) npm install axios cheerio
 *   2) node scrape-himpuh.js          <- mulai / lanjut otomatis
 *   3) Hasil: himpuh-travel.csv
 * ----------------------------------------------------------------------------
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// ====================== KONFIGURASI ======================
const START_ID      = 1;       // ID awal (diabaikan jika ada progress.json)
const END_ID        = 950;     // ID akhir
const DELAY_MS      = 2500;    // Jeda antar request — JANGAN dikecilkan
const SAVE_EVERY    = 10;      // Auto-save setiap N data berhasil dikumpulkan
const OUTPUT_CSV    = 'himpuh-travel.csv';
const OUTPUT_JSON   = 'himpuh-travel.json';
const PROGRESS_FILE = 'progress.json';

// Filter Jabodetabek (set false untuk ambil SEMUA wilayah)
const FILTER_JABODETABEK = true;
const KOTA_JABODETABEK = [
  'jakarta', 'bekasi', 'depok', 'tangerang', 'bogor',
  'jakarta pusat', 'jakarta selatan', 'jakarta barat', 'jakarta timur', 'jakarta utara',
  'tangerang selatan', 'kota tangerang', 'kabupaten bogor', 'kota bogor', 'kota bekasi',
];
// =========================================================

const BASE = 'https://himpuh.or.id/daftar-anggota/detail';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- helpers ----------

function getField($, label) {
  let val = '';
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim().toLowerCase();
      if (key.includes(label.toLowerCase())) {
        val = $(cells[1]).text().trim();
      }
    }
  });
  return val;
}

function isJabodetabek(alamat) {
  if (!alamat) return false;
  const a = alamat.toLowerCase();
  return KOTA_JABODETABEK.some((kota) => a.includes(kota));
}

function tebakKota(alamat) {
  if (!alamat) return '';
  const a = alamat.toLowerCase();
  const found = KOTA_JABODETABEK.find((k) => a.includes(k));
  return found ? found.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
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

// ---------- simpan ----------

function simpanCSV(hasil) {
  const header = [
    'No', 'Nama Perusahaan', 'Merek Dagang', 'Kota', 'Alamat',
    'Telepon/WA', 'Email', 'Website', 'Jenis', 'Link HIMPUH',
    'Status Follow-up', 'Catatan',
  ];
  const rows = hasil.map((d, i) => [
    i + 1, d.nama_perusahaan, d.merek_dagang, d.kota, d.alamat,
    d.telepon, d.email, d.website, d.jenis_anggota, d.url_himpuh,
    'Belum dihubungi', '',
  ].map(csvEscape).join(','));
  const csv = [header.map(csvEscape).join(','), ...rows].join('\n');
  fs.writeFileSync(OUTPUT_CSV, '\uFEFF' + csv, 'utf8');
}

function simpanJSON(hasil) {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(hasil, null, 2), 'utf8');
}

function simpanProgress(lastId, jumlah) {
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({ lastId, jumlah, savedAt: new Date().toISOString() }),
    'utf8'
  );
}

function muatProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function muatHasilLama() {
  try {
    if (fs.existsSync(OUTPUT_JSON)) {
      return JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
    }
  } catch (_) {}
  return [];
}

// ---------- scrape satu ID ----------

async function scrapeOne(id) {
  const url = `${BASE}/${id}`;
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (riset-kontak-travel; follow-up manual)',
        'Accept': 'text/html',
      },
      maxRedirects: 2,
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
    data.kota = tebakKota(data.alamat);
    return data;
  } catch (_) {
    return null;
  }
}

// ---------- main ----------

async function main() {
  const prog   = muatProgress();
  const hasil  = muatHasilLama();
  const startId = prog ? prog.lastId + 1 : START_ID;

  if (prog) {
    console.log(`▶ Melanjutkan dari ID ${startId} (sudah ${hasil.length} travel tersimpan).`);
  } else {
    console.log(`▶ Mulai baru — ID ${START_ID}–${END_ID}, jeda ${DELAY_MS}ms/req.`);
  }
  console.log(`  Auto-save setiap ${SAVE_EVERY} data terkumpul.\n`);

  let dicek        = 0;
  let baruDikumpul = 0;

  for (let id = startId; id <= END_ID; id++) {
    const data = await scrapeOne(id);
    dicek++;

    if (data) {
      const lolos = !FILTER_JABODETABEK || isJabodetabek(data.alamat);
      if (lolos) {
        hasil.push(data);
        baruDikumpul++;
        console.log(`✓ [${id}] ${data.nama_perusahaan} — ${data.kota || '?'} — ${data.telepon || 'no telp'}`);

        if (baruDikumpul % SAVE_EVERY === 0) {
          simpanCSV(hasil);
          simpanJSON(hasil);
          simpanProgress(id, hasil.length);
          console.log(`  💾 Auto-saved ${hasil.length} travel → ${OUTPUT_CSV}`);
        }
      } else {
        console.log(`· [${id}] ${data.nama_perusahaan} (luar Jabodetabek, dilewati)`);
      }
    }

    if (dicek % 50 === 0) {
      console.log(`  ── ${dicek} ID dicek, ${hasil.length} travel terkumpul ──`);
      simpanProgress(id, hasil.length);
    }

    await sleep(DELAY_MS);
  }

  simpanCSV(hasil);
  simpanJSON(hasil);
  simpanProgress(END_ID, hasil.length);

  console.log(`\n✅ Selesai! ${hasil.length} travel ${FILTER_JABODETABEK ? 'Jabodetabek ' : ''}tersimpan:`);
  console.log(`  📄 ${OUTPUT_CSV}   <- buka di Excel / Google Sheets`);
  console.log(`  📄 ${OUTPUT_JSON}`);
  console.log('\nIngat: follow-up manual & personal. Jangan blast spam. Hormati UU PDP.');

  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
}

main();
