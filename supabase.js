require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://sgwjybhtpuhseukuwgnc.supabase.co';
// Use secret key if unmasked, otherwise fallback to publishable key
const rawSecret = process.env.SUPABASE_SECRET_KEY || '';
const supabaseKey = (rawSecret && !rawSecret.includes('•'))
  ? rawSecret
  : (process.env.SUPABASE_PUBLISHABLE_KEY || '');

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[Supabase] Entegre edildi! Proje URL:', supabaseUrl);
  } catch (err) {
    console.warn('[Supabase] Bağlantı uyarısı:', err.message);
  }
} else {
  console.log('[Supabase] URL veya Key tanımlanmadı.');
}

/**
 * Supabase Cloud Sync Helpers (Opsiyonel bulut yedekleme)
 * Kullanıcı ve mesaj verilerini Supabase tablolarına da senkronize eder.
 */
async function syncUserToSupabase(user) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        username: user.username,
        email: user.email,
        tag: user.tag,
        avatar: user.avatar,
        status: user.status || 'online',
        custom_status: user.customStatus || ''
      });
    if (error) {
      // Tablo henüz Supabase panelinde açılmamış olabilir, sessizce geç
      // console.log('[Supabase Sync Notice]', error.message);
    } else {
      console.log(`[Supabase] Kullanıcı buluta senkronize edildi: ${user.username}`);
    }
  } catch (e) {
    // Ignore if table doesn't exist yet
  }
}

module.exports = {
  supabase,
  syncUserToSupabase
};
