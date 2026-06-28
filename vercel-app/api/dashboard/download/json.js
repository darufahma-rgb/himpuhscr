const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('himpuh_travel')
      .select('id,nama_perusahaan,merek_dagang,jenis_anggota,no_registrasi,alamat,telepon,email,website,url_himpuh,kota,status_followup,catatan')
      .order('id', { ascending: true });

    if (error) throw error;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="himpuh-travel.json"');
    res.status(200).send(JSON.stringify(data || [], null, 2));
  } catch (e) {
    console.error('[download/json] error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
