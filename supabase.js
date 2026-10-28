require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://fcpurlbmufrxqwozmxje.supabase.co';
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
  console.log('[Supabase] URL veya Key tanımlanmadı. Yerel database.json kullanılacak.');
}

// ============================================================
// SUPABASE BULUT VERİTABANI İŞLEMLERİ
// Tüm uygulama verisi "app_state" tablosunda JSONB olarak saklanır.
// ============================================================

const EMPTY_DB = {
  users: [],
  servers: [],
  messages: {},
  friends: {},
  friendRequests: []
};

/**
 * Supabase'den tüm veritabanını yükle.
 * Tablo yoksa veya boşsa varsayılan boş DB döner.
 */
async function loadFromSupabase() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'main')
      .single();

    if (error) {
      // Tablo henüz yoksa veya satır yoksa, oluşturmayı dene
      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.log('[Supabase] app_state tablosu/satırı bulunamadı. Yeni oluşturuluyor...');
        await initSupabaseTable();
        return { ...EMPTY_DB };
      }
      console.error('[Supabase] Veri yükleme hatası:', error.message);
      return null;
    }

    if (data && data.data) {
      console.log('[Supabase] ✅ Veritabanı buluttan yüklendi!');
      // Eksik alanları tamamla
      const loaded = data.data;
      return {
        users: loaded.users || [],
        servers: loaded.servers || [],
        messages: loaded.messages || {},
        friends: loaded.friends || {},
        friendRequests: loaded.friendRequests || []
      };
    }

    return { ...EMPTY_DB };
  } catch (e) {
    console.error('[Supabase] Yükleme istisnası:', e.message);
    return null;
  }
}

/**
 * Tüm veritabanını Supabase'e kaydet (upsert).
 */
async function saveToSupabase(db) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('app_state')
      .upsert({
        id: 'main',
        data: db,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('[Supabase] Kaydetme hatası:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Supabase] Kaydetme istisnası:', e.message);
    return false;
  }
}

/**
 * app_state tablosunu ilk kez oluştur (RPC veya doğrudan insert).
 */
async function initSupabaseTable() {
  if (!supabase) return;
  try {
    // Tabloyu oluşturmak için SQL çalıştırmayı dene
    // Not: Bu sadece RPC fonksiyonu tanımlıysa çalışır.
    // Tablo manuel oluşturulmalıdır (aşağıdaki SQL komutlarını kullanın).
    const { error } = await supabase
      .from('app_state')
      .insert({
        id: 'main',
        data: EMPTY_DB,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.log('[Supabase] Tablo oluşturma/insert hatası:', error.message);
      console.log('');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  SUPABASE TABLO OLUŞTURMA GEREKLİ!                 ║');
      console.log('║                                                          ║');
      console.log('║  Supabase paneline gidin:                                ║');
      console.log('║  https://supabase.com/dashboard → SQL Editor             ║');
      console.log('║                                                          ║');
      console.log('║  Aşağıdaki SQL komutunu çalıştırın:                      ║');
      console.log('║                                                          ║');
      console.log('║  CREATE TABLE IF NOT EXISTS app_state (                    ║');
      console.log('║    id TEXT PRIMARY KEY DEFAULT \'main\',                    ║');
      console.log('║    data JSONB NOT NULL DEFAULT \'{}\'::jsonb,               ║');
      console.log('║    updated_at TIMESTAMPTZ DEFAULT NOW()                   ║');
      console.log('║  );                                                       ║');
      console.log('║  ALTER TABLE app_state DISABLE ROW LEVEL SECURITY;        ║');
      console.log('║                                                          ║');
      console.log('║  INSERT INTO app_state (id, data) VALUES                 ║');
      console.log('║  (\'main\', \'{"users":[],"servers":[],                      ║');
      console.log('║  "messages":{},"friends":{},"friendRequests":[]}\')       ║');
      console.log('║  ON CONFLICT (id) DO NOTHING;                             ║');
      console.log('║                                                          ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
    } else {
      console.log('[Supabase] ✅ app_state tablosu başarıyla oluşturuldu.');
    }
  } catch (e) {
    console.error('[Supabase] Init hatası:', e.message);
  }
}

// Eski uyumluluk fonksiyonu (opsiyonel kullanıcı sync)
async function syncUserToSupabase(user) {
  // Artık tüm DB bir bütün olarak kaydediliyor,
  // bu fonksiyon geriye uyumluluk için kalıyor
}

module.exports = {
  supabase,
  syncUserToSupabase,
  loadFromSupabase,
  saveToSupabase,
  EMPTY_DB
};
