const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { data, error } = await supabase
      .from('himpuh_travel')
      .select('id,nama_perusahaan,merek_dagang,jenis_anggota,no_registrasi,alamat,telepon,email,website,url_himpuh,kota')
      .order('id', { ascending: true });

    if (error) throw error;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(data || []);
  } catch (e) {
    console.error('[api/data] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
