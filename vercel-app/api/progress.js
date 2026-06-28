const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { data } = await supabase
      .from('scraper_progress')
      .select('*')
      .eq('id', 1)
      .single();

    if (data) {
      res.status(200).json({
        lastId:  data.last_id,
        jumlah:  data.jumlah,
        savedAt: data.saved_at,
      });
    } else {
      res.status(200).json({});
    }
  } catch (e) {
    res.status(200).json({});
  }
};
