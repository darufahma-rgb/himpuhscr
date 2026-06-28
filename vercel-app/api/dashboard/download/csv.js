const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function generateCSV(records) {
  const esc = (s) => `"${(s ?? '').toString().replace(/"/g, '""')}"`;
  const header = [
    'No','Nama Perusahaan','Merek Dagang','Kota','Alamat',
    'Telepon/WA','Email','Website','Jenis','Link HIMPUH',
    'Status Follow-up','Catatan',
  ];
  const rows = records.map((d, i) => [
    i + 1, d.nama_perusahaan, d.merek_dagang, d.kota, d.alamat,
    d.telepon, d.email, d.website, d.jenis_anggota, d.url_himpuh,
    d.status_followup || 'Belum dihubungi', d.catatan || '',
  ].map(esc).join(','));
  return '\uFEFF' + [header.map(esc).join(','), ...rows].join('\n');
}

module.exports = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('himpuh_travel')
      .select('id,nama_perusahaan,merek_dagang,jenis_anggota,no_registrasi,alamat,telepon,email,website,url_himpuh,kota,status_followup,catatan')
      .order('id', { ascending: true });

    if (error) throw error;

    const csv = generateCSV(data || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="himpuh-travel.csv"');
    res.status(200).send(csv);
  } catch (e) {
    console.error('[download/csv] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
