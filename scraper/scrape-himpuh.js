/**
 * scrape-himpuh.js
 * ----------------------------------------------------------------------------
 * Mengambil data anggota dari direktori PUBLIK HIMPUH (himpuh.or.id),
 * lalu menyimpan ke CSV untuk follow-up MANUAL satu per satu.
 *
 * PRINSIP SOPAN & BERTANGGUNG JAWAB:
 *  - Direktori ini publik & memang ditujukan agar anggota dikontak.
 *  - Script memberi JEDA antar request (default 2.5 detik) agar tidak
 *    membebani server HIMPUH. JANGAN turunkan jeda jadi terlalu kecil.
 *  - Pakai data ini HANYA untuk follow-up personal yang relevan, BUKAN
 *    blast spam massal. Hormati UU PDP & etika.
 *  - Selalu hormati robots.txt situs. Cek https://himpuh.or.id/robots.txt
 *    sebelum menjalankan. Kalau dilarang, jangan dijalankan.
 *
 * CARA PAKAI (di Replit / lokal):
 *   1) npm install axios cheerio
 *   2) node scrape-himpuh.js
 *   3) Hasil: himpuh-travel.csv (buka di Excel/Google Sheets)
 *
 * Atur START_ID, END_ID sesuai kebutuhan. ID detail bersifat sekuensial.
 * ----------------------------------------------------------------------------
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// ====================== KONFIGURASI ======================
const START_ID = 1;          // ID halaman detail mulai
const END_ID = 950;          // ID halaman detail sampai (anggota ~236, ID bisa s/d 900-an)
const DELAY_MS = 2500;       // Jeda antar request (ms). JANGAN terlalu kecil — hormati server.
const OUTPUT_CSV = 'himpuh-travel.csv';
const OUTPUT_JSON = 'himpuh-travel.json';

// Filter Jabodetabek (kosongkan FILTER_JABODETABEK = false untuk ambil SEMUA)
const FILTER_JABODETABEK = true;
const KOTA_JABODETABEK = [
  'jakarta', 'bekasi', 'depok', 'tangerang', 'bogor',
  'jakarta pusat', 'jakarta selatan', 'jakarta barat', 'jakarta timur', 'jakarta utara',
  'tangerang selatan', 'kota tangerang', 'kabupaten bogor', 'kota bogor', 'kota bekasi',
];
// =========================================================

const BASE = 'https://himpuh.or.id/daftar-anggota/detail';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ambil nilai dari tabel berdasarkan label baris (kolom kiri)
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

// Tebak kota dari alamat (untuk kolom terpisah)
function tebakKota(alamat) {
  if (!alamat) return '';
  const a = alamat.toLowerCase();
  const found = KOTA_JABODETABEK.find((k) => a.includes(k));
  return found ? found.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

// Bersihkan nomor telepon → format follow-up
function bersihkanTelepon(raw) {
  if (!raw) return '';
  // Ambil angka & + saja, buang keterangan "(Kantor)" dll
  const match = raw.match(/[+]?[\d\s\-()]{7,}/);
  return match ? match[0].replace(/[\s\-()]/g, '').trim() : raw.trim();
}

function csvEscape(s) {
  const v = (s ?? '').toString().replace(/"/g, '""');
  return `"${v}"`;
}

async function scrapeOne(id) {
  const url = `${BASE}/${id}`;
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        // User-Agent sopan & jujur (identifikasi diri, bukan menyamar)
        'User-Agent': 'Mozilla/5.0 (riset-kontak-travel; follow-up manual)',
        'Accept': 'text/html',
      },
      // Redirect ke daftar-anggota = ID kosong
      maxRedirects: 2,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const $ = cheerio.load(res.data);

    const nama = getField($, 'Nama Perusahaan');
    if (!nama) return null; // halaman kosong / bukan detail valid

    const data = {
      id,
      nama_perusahaan: nama,
      merek_dagang: getField($, 'Merek Dagang'),
      jenis_anggota: getField($, 'Jenis Anggota'),
      no_registrasi: getField($, 'No Registrasi'),
      alamat: getField($, 'Kantor Pusat'),
      telepon: bersihkanTelepon(getField($, 'Nomor Telepon')),
      email: getField($, 'Email'),
      website: getField($, 'Website'),
      url_himpuh: url,
    };
    data.kota = tebakKota(data.alamat);
    return data;
  } catch (err) {
    // 404 / redirect / error → lewati
    return null;
  }
}

async function main() {
  console.log(`Mulai ambil data HIMPUH (ID ${START_ID}–${END_ID}), jeda ${DELAY_MS}ms/req.`);
  console.log('Pastikan sudah cek robots.txt & gunakan untuk follow-up manual yang etis.\n');

  const hasil = [];
  let dicek = 0;

  for (let id = START_ID; id <= END_ID; id++) {
    const data = await scrapeOne(id);
    dicek++;

    if (data) {
      const lolosFilter = !FILTER_JABODETABEK || isJabodetabek(data.alamat);
      if (lolosFilter) {
        hasil.push(data);
        console.log(`✓ [${id}] ${data.nama_perusahaan} — ${data.kota || 'kota?'} — ${data.telepon || 'no telp'}`);
      } else {
        console.log(`· [${id}] ${data.nama_perusahaan} (luar Jabodetabek, dilewati)`);
      }
    }

    // Progress tiap 50
    if (dicek % 50 === 0) console.log(`   ...sudah cek ${dicek} ID, ketemu ${hasil.length} travel.`);

    await sleep(DELAY_MS); // JEDA SOPAN — jangan dihilangkan
  }

  // Simpan JSON
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(hasil, null, 2), 'utf8');

  // Simpan CSV
  const header = ['No', 'Nama Perusahaan', 'Merek Dagang', 'Kota', 'Alamat', 'Telepon/WA', 'Email', 'Website', 'Jenis', 'Link HIMPUH', 'Status Follow-up', 'Catatan'];
  const rows = hasil.map((d, i) => [
    i + 1, d.nama_perusahaan, d.merek_dagang, d.kota, d.alamat,
    d.telepon, d.email, d.website, d.jenis_anggota, d.url_himpuh,
    'Belum dihubungi', '',
  ].map(csvEscape).join(','));
  const csv = [header.map(csvEscape).join(','), ...rows].join('\n');
  fs.writeFileSync(OUTPUT_CSV, '\uFEFF' + csv, 'utf8'); // BOM agar Excel baca UTF-8

  console.log(`\nSelesai. ${hasil.length} travel ${FILTER_JABODETABEK ? 'Jabodetabek ' : ''}tersimpan di:`);
  console.log(`  - ${OUTPUT_CSV} (buka di Excel/Sheets)`);
  console.log(`  - ${OUTPUT_JSON}`);
  console.log('\nIngat: follow-up manual & personal. Jangan blast spam. Hormati UU PDP.');
}

main();
