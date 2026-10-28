require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { supabase, syncUserToSupabase, loadFromSupabase, saveToSupabase, EMPTY_DB } = require('./supabase');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8, // 100 MB for images & attachments
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '100mb' }));

// Health Check for Electron Desktop & Services
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), dbSource: dbSource });
});

// ----------------------------------------------------
// DATABASE & PERSISTENCE
// Öncelik: 1) Supabase (bulut)  2) database.json (yerel yedek)
// ----------------------------------------------------
const DB_PATH = path.join(__dirname, 'database.json');
let dbSource = 'initializing'; // 'supabase' veya 'local'

function loadDatabaseLocal() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[DB] Yerel dosya yükleme hatası:', err);
  }
  return { ...EMPTY_DB };
}

// Başlangıçta boş DB ile başla, async init'te doldurulacak
let db = { ...EMPTY_DB };

// Supabase'e kaydetme işlemini debounce et (çok sık yazma olmasın)
let saveTimer = null;
function saveDatabase() {
  // 1. Yerel dosyaya her zaman yaz (yedek)
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    // Render'da dosya sistemi yazılamayabilir, sorun değil
  }

  // 2. Supabase'e debounced kaydet (500ms bekle, toplu kaydet)
  if (supabase) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const ok = await saveToSupabase(db);
      if (!ok) {
        console.error('[DB] ⚠️ Supabase kaydetme başarısız!');
      }
    }, 500);
  }
}

// Sunucu başlarken veritabanını yükle (async)
async function initDatabase() {
  // Önce Supabase'den yüklemeyi dene
  const cloudData = await loadFromSupabase();
  if (cloudData) {
    db = cloudData;
    dbSource = 'supabase';
    console.log(`[DB] ✅ Supabase'den yüklendi! (${db.users.length} kullanıcı, ${db.servers.length} sunucu)`);
    return;
  }

  // Supabase başarısız olduysa yerel dosyadan yükle
  db = loadDatabaseLocal();
  dbSource = 'local';
  console.log(`[DB] 📁 Yerel database.json'dan yüklendi. (${db.users.length} kullanıcı, ${db.servers.length} sunucu)`);
}

// ----------------------------------------------------
// EMAIL VERIFICATION (Nodemailer / Gmail SMTP)
// ----------------------------------------------------
// Pending registrations awaiting 6-digit email OTP verification
// email -> { code, email, username, passwordHash, expiresAt }
const pendingVerifications = new Map();

// Configure Nodemailer transporter (Gmail SMTP)
// User can configure GMAIL_USER and GMAIL_APP_PASSWORD in environment or config
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || '';

let transporter = null;
if (GMAIL_USER && GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS
    }
  });
  console.log(`[Email] Gmail SMTP configured for: ${GMAIL_USER}`);
} else {
  console.log('[Email] Gmail SMTP credentials not set in env. OTP codes will be displayed on console & screen.');
}

async function sendVerificationEmail(toEmail, code, username) {
  console.log(`\n======================================================`);
  console.log(`📧 [DOĞRULAMA KODU OLUŞTURULDU]`);
  console.log(`Alıcı E-posta: ${toEmail} (${username})`);
  console.log(`6 Haneli Doğrulama Kodu: >>> ${code} <<<`);
  console.log(`======================================================\n`);

  // 1. Send via Gmail SMTP if GMAIL_USER and GMAIL_APP_PASSWORD are set in .env
  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"Türkdc" <${GMAIL_USER}>`,
        to: toEmail,
        subject: `Türkdc - E-posta Doğrulama Kodun: ${code}`,
        html: `
          <div style="background-color: #313338; color: #dbdee1; padding: 30px; font-family: sans-serif; border-radius: 8px; max-width: 500px; margin: auto;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #5865F2; margin: 0;">Türkdc Doğrulama</h1>
            </div>
            <p style="font-size: 16px;">Merhaba <b>${username}</b>,</p>
            <p style="font-size: 14px; color: #949ba4;">Türkdc hesabını onaylamak için aşağıdaki 6 haneli doğrulama kodunu kullan:</p>
            <div style="background-color: #2b2d31; border: 2px dashed #5865F2; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #57f287;">${code}</span>
            </div>
            <p style="font-size: 12px; color: #949ba4;">Bu kodu kimseyle paylaşmayın. Kod 15 dakika geçerlidir.</p>
          </div>
        `
      });
      console.log(`✅ [Gmail] E-posta başarıyla gönderildi -> ${toEmail}`);
      return { success: true, sent: true };
    } catch (err) {
      console.error(`❌ [Gmail SMTP Hatası]:`, err.message);
    }
  }

  // 2. Also attempt Supabase Cloud Auth OTP if connected
  if (supabase) {
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: toEmail });
      if (!error) {
        console.log(`✅ [Supabase] Bulut e-posta doğrulama kodu gönderildi -> ${toEmail}`);
        return { success: true, sent: true };
      }
    } catch (e) {
      // Ignored
    }
  }

  console.log(`ℹ️ [Bilgi] Gmail ile doğrudan e-posta göndermek için .env dosyasına GMAIL_USER ve GMAIL_APP_PASSWORD ekleyin.`);
  return { success: true, sent: false };
}

// ----------------------------------------------------
// IN-MEMORY ACTIVE SESSIONS & SOCKET MAPPINGS
// ----------------------------------------------------
const activeSockets = new Map(); // socket.id -> userId
const userSockets = new Map(); // userId -> Set of socket.ids
const voiceRooms = new Map(); // channelId -> Set of socket.ids

function getUserById(userId) {
  return db.users.find(u => u.id === userId);
}

function getSafeUserProfile(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

// ----------------------------------------------------
// REST API FOR AUTH & HELPERS
// ----------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', usersCount: db.users.length, serversCount: db.servers.length });
});

// ----------------------------------------------------
// SOCKET.IO REAL-TIME SYSTEM
// ----------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. REGISTER: Send verification code to email
  socket.on('auth:register-request', async ({ email, username, password }) => {
    email = (email || '').trim().toLowerCase();
    username = (username || '').trim();

    if (!email || !username || !password) {
      return socket.emit('auth:error', { message: 'Lütfen tüm alanları doldurun.' });
    }

    if (password.length < 6) {
      return socket.emit('auth:error', { message: 'Şifre en az 6 karakter olmalıdır.' });
    }

    // Check if email already registered
    const existing = db.users.find(u => u.email.toLowerCase() === email);
    if (existing) {
      return socket.emit('auth:error', { message: 'Bu e-posta adresi zaten kayıtlı!' });
    }

    // Generate 6-digit numeric OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const passwordHash = bcrypt.hashSync(password, 10);

    // Save to pending verifications (expires in 15 mins)
    pendingVerifications.set(email, {
      code: otpCode,
      email,
      username,
      passwordHash,
      expiresAt: Date.now() + 15 * 60 * 1000
    });

    // Send email
    const mailResult = await sendVerificationEmail(email, otpCode, username);

    socket.emit('auth:register-code-sent', {
      email,
      debugCode: otpCode, // Provided so user can test immediately in UI if Gmail credentials not setup
      mailSent: mailResult.sent
    });
  });

  // 2. VERIFY CODE & CREATE USER
  socket.on('auth:verify-code', ({ email, code }) => {
    email = (email || '').trim().toLowerCase();
    code = (code || '').trim();

    const pending = pendingVerifications.get(email);
    if (!pending) {
      return socket.emit('auth:error', { message: 'Doğrulama oturumu bulunamadı. Lütfen tekrar kayıt olun.' });
    }

    if (Date.now() > pending.expiresAt) {
      pendingVerifications.delete(email);
      return socket.emit('auth:error', { message: 'Doğrulama kodunun süresi dolmuş. Lütfen yeniden kod isteyin.' });
    }

    if (pending.code !== code) {
      return socket.emit('auth:error', { message: 'Girdiğiniz doğrulama kodu hatalı! Lütfen kontrol edin.' });
    }

    // Generate random 4-digit tag
    const tag = Math.floor(1000 + Math.random() * 9000).toString();
    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: pending.email,
      username: pending.username,
      tag: tag,
      passwordHash: pending.passwordHash,
      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${pending.username}_${tag}`,
      bannerColor: '#5865F2',
      aboutMe: 'Merhaba! Ben Türkdc kullanıyorum.',
      status: 'online',
      customStatus: 'Türkdc kullanıyor',
      verified: true,
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    db.friends[newUser.id] = [];
    saveDatabase();
    syncUserToSupabase(newUser);

    pendingVerifications.delete(email);
    console.log(`[User Created] ${newUser.username}#${newUser.tag} (${newUser.email})`);

    // Log user in directly
    loginUserSocket(socket, newUser);
  });

  // 3. LOGIN WITH EMAIL & PASSWORD
  socket.on('auth:login', ({ email, password }) => {
    email = (email || '').trim().toLowerCase();

    if (!email || !password) {
      return socket.emit('auth:error', { message: 'Lütfen e-posta ve şifrenizi girin.' });
    }

    const user = db.users.find(u => u.email.toLowerCase() === email);
    if (!user) {
      return socket.emit('auth:error', { message: 'E-posta veya şifre hatalı!' });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      return socket.emit('auth:error', { message: 'E-posta veya şifre hatalı!' });
    }

    loginUserSocket(socket, user);
  });

  // 4. RESTORE SESSION VIA USER ID / TOKEN
  socket.on('auth:restore-session', ({ userId }) => {
    const user = getUserById(userId);
    if (user) {
      loginUserSocket(socket, user);
    } else {
      socket.emit('auth:session-invalid');
    }
  });

  function loginUserSocket(sock, user) {
    activeSockets.set(sock.id, user.id);

    if (!userSockets.has(user.id)) {
      userSockets.set(user.id, new Set());
    }
    userSockets.get(user.id).add(sock.id);

    // Get user's servers (servers they created or joined)
    const userServers = db.servers.filter(s =>
      s.ownerId === user.id || (s.members && s.members.includes(user.id))
    );

    // Get user's friends list
    const friendIds = db.friends[user.id] || [];
    const friendsList = friendIds.map(fId => {
      const u = getUserById(fId);
      return u ? {
        ...getSafeUserProfile(u),
        isOnline: userSockets.has(fId) && userSockets.get(fId).size > 0
      } : null;
    }).filter(Boolean);

    // Get user's pending friend requests
    const pendingRequests = db.friendRequests.filter(req =>
      (req.toId === user.id || req.fromId === user.id) && req.status === 'pending'
    ).map(req => {
      const fromUser = getUserById(req.fromId);
      const toUser = getUserById(req.toId);
      return {
        id: req.id,
        fromId: req.fromId,
        toId: req.toId,
        fromUser: getSafeUserProfile(fromUser),
        toUser: getSafeUserProfile(toUser),
        type: req.toId === user.id ? 'incoming' : 'outgoing',
        timestamp: req.timestamp
      };
    });

    sock.emit('auth:success', {
      user: getSafeUserProfile(user),
      servers: userServers,
      friends: friendsList,
      friendRequests: pendingRequests
    });

    // Broadcast user online status to all friends
    broadcastStatusToFriends(user.id, 'online');
  }

  // ----------------------------------------------------
  // FRIEND MANAGEMENT
  // ----------------------------------------------------
  // Send Friend Request by username#tag or username
  socket.on('friends:send-request', ({ tagInput }) => {
    const userId = activeSockets.get(socket.id);
    const sender = getUserById(userId);
    if (!sender) return;

    const trimmed = (tagInput || '').trim();
    let targetUser = null;

    if (trimmed.includes('#')) {
      const [uName, uTag] = trimmed.split('#');
      targetUser = db.users.find(u =>
        u.username.toLowerCase() === uName.toLowerCase() && u.tag === uTag
      );
    } else if (trimmed.includes('@')) {
      targetUser = db.users.find(u =>
        u.email.toLowerCase() === trimmed.toLowerCase()
      );
    } else {
      // Find other user with this username, excluding sender
      targetUser = db.users.find(u =>
        u.username.toLowerCase() === trimmed.toLowerCase() && u.id !== sender.id
      ) || db.users.find(u => u.username.toLowerCase() === trimmed.toLowerCase());
    }

    if (!targetUser) {
      return socket.emit('friends:error', { message: 'Kullanıcı bulunamadı. Kullanıcı adı, etiket veya e-posta girin (Örn: cinar#8899)' });
    }

    if (targetUser.id === sender.id) {
      return socket.emit('friends:error', { message: 'Kendine arkadaşlık isteği gönderemezsin!' });
    }

    // Check if already friends
    const currentFriends = db.friends[sender.id] || [];
    if (currentFriends.includes(targetUser.id)) {
      return socket.emit('friends:error', { message: 'Bu kullanıcı zaten arkadaş listenizde!' });
    }

    // Check if request already pending
    const existingReq = db.friendRequests.find(r =>
      ((r.fromId === sender.id && r.toId === targetUser.id) ||
        (r.fromId === targetUser.id && r.toId === sender.id)) &&
      r.status === 'pending'
    );
    if (existingReq) {
      return socket.emit('friends:error', { message: 'Zaten bekleyen bir arkadaşlık isteği var!' });
    }

    const newRequest = {
      id: `freq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fromId: sender.id,
      toId: targetUser.id,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    db.friendRequests.push(newRequest);
    saveDatabase();

    socket.emit('friends:request-sent', {
      request: {
        id: newRequest.id,
        fromId: sender.id,
        toId: targetUser.id,
        fromUser: getSafeUserProfile(sender),
        toUser: getSafeUserProfile(targetUser),
        type: 'outgoing',
        timestamp: newRequest.timestamp
      }
    });

    // Notify recipient in real time if online
    emitToUser(targetUser.id, 'friends:request-received', {
      request: {
        id: newRequest.id,
        fromId: sender.id,
        toId: targetUser.id,
        fromUser: getSafeUserProfile(sender),
        toUser: getSafeUserProfile(targetUser),
        type: 'incoming',
        timestamp: newRequest.timestamp
      }
    });
  });

  // Accept Friend Request
  socket.on('friends:accept-request', ({ requestId }) => {
    const userId = activeSockets.get(socket.id);
    if (!userId) return;

    const req = db.friendRequests.find(r => r.id === requestId && r.toId === userId && r.status === 'pending');
    if (!req) return;

    req.status = 'accepted';

    if (!db.friends[req.fromId]) db.friends[req.fromId] = [];
    if (!db.friends[req.toId]) db.friends[req.toId] = [];

    if (!db.friends[req.fromId].includes(req.toId)) db.friends[req.fromId].push(req.toId);
    if (!db.friends[req.toId].includes(req.fromId)) db.friends[req.toId].push(req.fromId);

    saveDatabase();

    const fromUser = getUserById(req.fromId);
    const toUser = getUserById(req.toId);

    // Notify both users
    emitToUser(req.toId, 'friends:added', {
      friend: {
        ...getSafeUserProfile(fromUser),
        isOnline: userSockets.has(fromUser.id) && userSockets.get(fromUser.id).size > 0
      },
      requestId
    });

    emitToUser(req.fromId, 'friends:added', {
      friend: {
        ...getSafeUserProfile(toUser),
        isOnline: userSockets.has(toUser.id) && userSockets.get(toUser.id).size > 0
      },
      requestId
    });
  });

  // Reject / Cancel Friend Request
  socket.on('friends:reject-request', ({ requestId }) => {
    const userId = activeSockets.get(socket.id);
    if (!userId) return;

    const index = db.friendRequests.findIndex(r => r.id === requestId && (r.toId === userId || r.fromId === userId));
    if (index > -1) {
      const req = db.friendRequests[index];
      db.friendRequests.splice(index, 1);
      saveDatabase();

      emitToUser(req.fromId, 'friends:request-removed', { requestId });
      emitToUser(req.toId, 'friends:request-removed', { requestId });
    }
  });

  // Discover Users (Suggestions under Add Friend tab)
  socket.on('friends:discover-users', () => {
    const userId = activeSockets.get(socket.id);
    if (!userId) return;
    const myFriends = db.friends[userId] || [];
    const suggestions = db.users
      .filter(u => u.id !== userId && !myFriends.includes(u.id))
      .slice(0, 15)
      .map(u => ({
        ...getSafeUserProfile(u),
        isOnline: userSockets.has(u.id) && userSockets.get(u.id).size > 0,
        hasPendingRequest: db.friendRequests.some(r =>
          ((r.fromId === userId && r.toId === u.id) || (r.fromId === u.id && r.toId === userId)) &&
          r.status === 'pending'
        )
      }));

    socket.emit('friends:discovered-list', suggestions);
  });

  // ----------------------------------------------------
  // SERVER CREATION & MANAGEMENT (NO PRE-MADE DUMMY SERVERS)
  // ----------------------------------------------------
  socket.on('server:create', ({ name, icon, banner }) => {
    const userId = activeSockets.get(socket.id);
    const user = getUserById(userId);
    if (!user) return;

    const newServer = {
      id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim() || 'Yeni Sunucu',
      icon: icon || '🚀',
      banner: banner || 'linear-gradient(135deg, #5865F2, #99aab5)',
      ownerId: user.id,
      members: [user.id],
      inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      categories: [
        {
          id: `cat_txt_${Date.now()}`,
          name: 'METİN KANALLARI',
          channels: [
            { id: `chan_${Date.now()}_genel`, name: 'genel-sohbet', type: 'text', topic: 'Sunucu sohbeti' }
          ]
        },
        {
          id: `cat_vc_${Date.now()}`,
          name: 'SES KANALLARI',
          channels: [
            { id: `vc_${Date.now()}_genel`, name: 'Genel Ses Odası', type: 'voice' }
          ]
        }
      ]
    };

    db.servers.push(newServer);
    saveDatabase();

    socket.emit('server:created', newServer);
    console.log(`[Server Created] ${newServer.name} by ${user.username}`);
  });

  // Join Server via Invite Code
  socket.on('server:join-invite', ({ inviteCode }) => {
    const userId = activeSockets.get(socket.id);
    const user = getUserById(userId);
    if (!user) return;

    const code = (inviteCode || '').trim().toUpperCase();
    const serverToJoin = db.servers.find(s => s.inviteCode === code || s.id === code);

    if (!serverToJoin) {
      return socket.emit('server:error', { message: 'Geçersiz davet kodu!' });
    }

    if (!serverToJoin.members) serverToJoin.members = [];
    if (!serverToJoin.members.includes(user.id)) {
      serverToJoin.members.push(user.id);
      saveDatabase();
    }

    socket.emit('server:joined', serverToJoin);
  });

  // Update Server Icon (Photo or Emoji)
  socket.on('server:update-icon', ({ serverId, icon }) => {
    const userId = activeSockets.get(socket.id);
    const s = db.servers.find(srv => srv.id === serverId);
    if (!s || s.ownerId !== userId) return;
    s.icon = icon;
    saveDatabase();
    io.emit('server:updated', s);
  });

  // Create Channel inside Server
  socket.on('channel:create', ({ serverId, categoryId, channelName, type, topic }) => {
    const s = db.servers.find(srv => srv.id === serverId);
    if (!s) return;

    const category = s.categories.find(c => c.id === categoryId) || s.categories[0];
    if (!category) return;

    const newChannel = {
      id: `${type === 'voice' ? 'vc' : 'chan'}_${Date.now()}`,
      name: channelName.toLowerCase().replace(/\s+/g, '-'),
      type: type || 'text',
      topic: topic || ''
    };

    category.channels.push(newChannel);
    saveDatabase();

    // Broadcast to all members of this server
    s.members.forEach(mId => {
      emitToUser(mId, 'channel:added', { serverId, categoryId: category.id, channel: newChannel });
    });
  });

  // ----------------------------------------------------
  // MESSAGES & CHAT
  // ----------------------------------------------------
  socket.on('messages:get', ({ channelId }) => {
    const history = db.messages[channelId] || [];
    socket.emit('messages:history', { channelId, messages: history });
  });

  socket.on('message:send', ({ channelId, content, attachment }) => {
    const userId = activeSockets.get(socket.id);
    const user = getUserById(userId);
    if (!user) return;

    const newMsg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      channelId,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      content: content || '',
      attachment: attachment || null,
      timestamp: new Date().toISOString(),
      reactions: {}
    };

    if (!db.messages[channelId]) {
      db.messages[channelId] = [];
    }
    db.messages[channelId].push(newMsg);

    if (db.messages[channelId].length > 250) {
      db.messages[channelId].shift();
    }

    saveDatabase();
    io.emit('message:new', newMsg);
  });

  socket.on('message:react', ({ channelId, messageId, emoji }) => {
    const userId = activeSockets.get(socket.id);
    if (!userId || !db.messages[channelId]) return;

    const msg = db.messages[channelId].find(m => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const idx = msg.reactions[emoji].indexOf(userId);
    if (idx > -1) {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(userId);
    }

    saveDatabase();
    io.emit('message:reaction-updated', { channelId, messageId, reactions: msg.reactions });
  });

  socket.on('typing:start', ({ channelId }) => {
    const userId = activeSockets.get(socket.id);
    const user = getUserById(userId);
    if (!user) return;
    socket.broadcast.emit('typing:status', { channelId, user: getSafeUserProfile(user), isTyping: true });
  });

  socket.on('typing:stop', ({ channelId }) => {
    const userId = activeSockets.get(socket.id);
    const user = getUserById(userId);
    if (!user) return;
    socket.broadcast.emit('typing:status', { channelId, user: getSafeUserProfile(user), isTyping: false });
  });

  // ----------------------------------------------------
  // WEBRTC & VOICE CHANNELS
  // ----------------------------------------------------
  socket.on('voice:join', ({ channelId, serverId }) => {
    const userId = activeSockets.get(socket.id);
    const user = getUserById(userId);
    if (!user) return;

    if (!voiceRooms.has(channelId)) {
      voiceRooms.set(channelId, new Set());
    }

    const room = voiceRooms.get(channelId);
    const existingParticipants = Array.from(room).map(sId => {
      const uId = activeSockets.get(sId);
      const u = getUserById(uId);
      return u ? { ...getSafeUserProfile(u), socketId: sId } : null;
    }).filter(Boolean);

    room.add(socket.id);
    socket.join(`voice:${channelId}`);

    socket.emit('voice:existing-peers', { channelId, peers: existingParticipants });
    socket.to(`voice:${channelId}`).emit('voice:peer-joined', {
      peer: { ...getSafeUserProfile(user), socketId: socket.id },
      channelId
    });

    broadcastVoiceRoomState(channelId);
  });

  socket.on('voice:signal', ({ targetSocketId, signal }) => {
    io.to(targetSocketId).emit('voice:signal', {
      senderSocketId: socket.id,
      signal
    });
  });

  socket.on('voice:state-change', (states) => {
    socket.broadcast.emit('voice:peer-state-updated', {
      socketId: socket.id,
      states
    });
  });

  socket.on('voice:speaking', ({ isSpeaking }) => {
    socket.broadcast.emit('voice:peer-speaking', {
      socketId: socket.id,
      isSpeaking
    });
  });

  socket.on('voice:leave', () => {
    leaveAllVoiceRooms(socket);
  });

  function leaveAllVoiceRooms(sock) {
    voiceRooms.forEach((room, channelId) => {
      if (room.has(sock.id)) {
        room.delete(sock.id);
        sock.leave(`voice:${channelId}`);
        sock.to(`voice:${channelId}`).emit('voice:peer-left', { socketId: sock.id, channelId });
        broadcastVoiceRoomState(channelId);
      }
    });
  }

  function broadcastVoiceRoomState(channelId) {
    const room = voiceRooms.get(channelId);
    const usersInVoice = room
      ? Array.from(room).map(sId => {
        const uId = activeSockets.get(sId);
        const u = getUserById(uId);
        return u ? { ...getSafeUserProfile(u), socketId: sId } : null;
      }).filter(Boolean)
      : [];

    io.emit('voice:room-state', { channelId, users: usersInVoice });
  }

  // ----------------------------------------------------
  // USER PROFILE UPDATE
  // ----------------------------------------------------
  socket.on('user:update-profile', (updates) => {
    const userId = activeSockets.get(socket.id);
    const user = getUserById(userId);
    if (!user) return;

    if (updates.username) user.username = updates.username.trim();
    if (updates.customStatus !== undefined) user.customStatus = updates.customStatus.trim();
    if (updates.bannerColor) user.bannerColor = updates.bannerColor;
    if (updates.aboutMe !== undefined) user.aboutMe = updates.aboutMe.trim();
    if (updates.status) user.status = updates.status;
    if (updates.avatar) user.avatar = updates.avatar;

    saveDatabase();

    const safe = getSafeUserProfile(user);
    socket.emit('user:profile-updated', safe);
    io.emit('user:updated', safe);
  });

  // ----------------------------------------------------
  // DIRECT 1-ON-1 CALLS
  // ----------------------------------------------------
  socket.on('dm:call-start', ({ targetUserId, hasVideo }) => {
    const userId = activeSockets.get(socket.id);
    const sender = getUserById(userId);
    if (!sender) return;

    emitToUser(targetUserId, 'dm:incoming-call', {
      caller: getSafeUserProfile(sender),
      hasVideo
    });
  });

  // ----------------------------------------------------
  // DISCONNECTION
  // ----------------------------------------------------
  socket.on('disconnect', () => {
    leaveAllVoiceRooms(socket);
    const userId = activeSockets.get(socket.id);
    activeSockets.delete(socket.id);

    if (userId && userSockets.has(userId)) {
      const set = userSockets.get(userId);
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(userId);
        broadcastStatusToFriends(userId, 'offline');
      }
    }
  });
});

function emitToUser(userId, event, data) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.forEach(sId => io.to(sId).emit(event, data));
  }
}

function broadcastStatusToFriends(userId, status) {
  const friendIds = db.friends[userId] || [];
  friendIds.forEach(fId => {
    emitToUser(fId, 'friends:status-change', { userId, status });
  });
}

function getNetworkIps() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ name, address: net.address });
      }
    }
  }
  return results;
}

// Start Server on all interfaces (0.0.0.0)
server.listen(PORT, '0.0.0.0', async () => {
  await initDatabase();
  const ips = getNetworkIps();
  console.log(`===============================================`);
  console.log(`🚀 Türkdc Sunucusu Çalışıyor!`);
  console.log(`👉 Bu Bilgisayarda (Yerel): http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach(ip => {
      console.log(`👉 Ağdaki/Wi-Fi'daki Arkadaşların: http://${ip.address}:${PORT} (${ip.name})`);
    });
  }
  console.log(`===============================================`);
});
