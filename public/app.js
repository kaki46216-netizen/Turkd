/**
 * DISCORD DESKTOP & WEB - CLIENT APPLICATION
 * Complete real-time client with Authentication, Email OTP verification,
 * Friends Hub, WebRTC voice/video & screen sharing, and persistent settings.
 */

// =============================================================================
// 1. DISCORD SOUND ENGINE (Web Audio API Synthesizer)
// =============================================================================
class DiscordSoundEngine {
  constructor() {
    this.ctx = null;
    this.ringtoneInterval = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playJoinSound() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.3);
    });
  }

  playLeaveSound() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [659.25, 440].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.3);
    });
  }

  playMuteSound(isMuted) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isMuted ? 320 : 480, now);
    osc.frequency.exponentialRampToValueAtTime(isMuted ? 220 : 640, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playDeafenSound(isDeafened) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isDeafened ? 580 : 380, now);
    osc.frequency.exponentialRampToValueAtTime(isDeafened ? 260 : 760, now + 0.12);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playMessagePop() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.06);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  startRingtone() {
    this.stopRingtone();
    const playTune = () => {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.18, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.2);
      });
    };
    playTune();
    this.ringtoneInterval = setInterval(playTune, 2400);
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }
}

const sounds = new DiscordSoundEngine();

// =============================================================================
// 2. CLIENT APPLICATION STATE
// =============================================================================
let state = {
  socket: null,
  isAuthenticated: false,
  currentUser: null, // Logged in user profile
  pendingVerifyEmail: '',

  servers: [], // Initially empty - no dummy servers!
  currentServer: null, // null = Home / Friends & DMs view
  currentChannel: null, // active text or DM channel

  friends: [], // array of friend user objects
  friendRequests: [], // array of incoming & outgoing requests
  activeFriendsTab: 'online', // 'online' | 'all' | 'pending' | 'add'

  // Voice & Media
  activeVoiceChannel: null,
  localStream: null,
  screenStream: null,
  isMuted: false,
  isDeafened: false,
  isVideoOn: false,
  isScreenSharing: false,
  peerConnections: new Map(), // socketId -> RTCPeerConnection
  audioContext: null,
  analyser: null,
  speakingInterval: null,

  // UI state
  activeAttachment: null,
  isTyping: false,
  typingTimeout: null
};

// WebRTC ICE Configuration (STUN + TURN for NAT/Firewall traversal between different houses/networks)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// =============================================================================
// 3. DOM ELEMENTS
// =============================================================================
const dom = {
  // Auth Elements
  authWrapper: document.getElementById('auth-wrapper'),
  authViewLogin: document.getElementById('auth-view-login'),
  authViewRegister: document.getElementById('auth-view-register'),
  authViewVerify: document.getElementById('auth-view-verify'),
  formLogin: document.getElementById('form-login'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginErrorBanner: document.getElementById('login-error-banner'),
  btnGoToRegister: document.getElementById('btn-go-to-register'),
  formRegister: document.getElementById('form-register'),
  regEmail: document.getElementById('reg-email'),
  regUsername: document.getElementById('reg-username'),
  regPassword: document.getElementById('reg-password'),
  registerErrorBanner: document.getElementById('register-error-banner'),
  btnGoToLogin: document.getElementById('btn-go-to-login'),
  formVerify: document.getElementById('form-verify'),
  verifySubtitle: document.getElementById('verify-subtitle'),
  verifyCodeInput: document.getElementById('verify-code-input'),
  verifyErrorBanner: document.getElementById('verify-error-banner'),
  debugCodeDisplay: document.getElementById('debug-code-display'),
  btnBackToRegister: document.getElementById('btn-back-to-register'),

  // Main App
  appContainer: document.getElementById('app'),
  btnHome: document.getElementById('btn-home'),
  guildList: document.getElementById('guild-list'),
  btnAddServer: document.getElementById('btn-add-server'),
  btnJoinServer: document.getElementById('btn-join-server'),
  sidebarHeader: document.getElementById('sidebar-header'),
  currentServerTitle: document.getElementById('current-server-title'),
  serverDropdownMenu: document.getElementById('server-dropdown-menu'),
  channelsScroller: document.getElementById('channels-scroller'),

  // User Dock
  userDock: document.getElementById('user-dock'),
  selfAvatar: document.getElementById('self-avatar'),
  selfStatusDot: document.getElementById('self-status-dot'),
  selfDisplayname: document.getElementById('self-displayname'),
  selfSubtext: document.getElementById('self-subtext'),
  btnToggleMic: document.getElementById('btn-toggle-mic'),
  btnToggleDeafen: document.getElementById('btn-toggle-deafen'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnSelfProfile: document.getElementById('btn-self-profile'),
  iconMicOn: document.getElementById('icon-mic-on'),
  iconMicOff: document.getElementById('icon-mic-off'),
  iconDeafenOn: document.getElementById('icon-deafen-on'),
  iconDeafenOff: document.getElementById('icon-deafen-off'),

  // Voice Dock
  voiceDock: document.getElementById('voice-connection-dock'),
  voiceDockTitle: document.getElementById('voice-dock-title'),
  voiceDockChannel: document.getElementById('voice-dock-channel'),
  btnDisconnectVoice: document.getElementById('btn-disconnect-voice'),
  dockBtnCamera: document.getElementById('dock-btn-camera'),
  dockBtnScreen: document.getElementById('dock-btn-screen'),

  // Chat & Header
  headerServerChannelView: document.getElementById('header-server-channel-view'),
  headerFriendsView: document.getElementById('header-friends-view'),
  headerChannelIcon: document.getElementById('header-channel-icon'),
  headerChannelName: document.getElementById('header-channel-name'),
  headerChannelTopic: document.getElementById('header-channel-topic'),
  btnStartDmVoice: document.getElementById('btn-start-dm-voice'),
  btnStartDmVideo: document.getElementById('btn-start-dm-video'),
  btnToggleMembers: document.getElementById('btn-toggle-members'),
  sidebarMembers: document.getElementById('sidebar-members'),
  membersOnlineList: document.getElementById('members-online-list'),
  membersOnlineTitle: document.getElementById('members-online-title'),

  // Friends Hub
  friendsHub: document.getElementById('friends-hub'),
  paneFriendsAdd: document.getElementById('pane-friends-add'),
  paneFriendsList: document.getElementById('pane-friends-list'),
  formAddFriend: document.getElementById('form-add-friend'),
  inputFriendTag: document.getElementById('input-friend-tag'),
  friendRequestAlert: document.getElementById('friend-request-alert'),
  friendsListHeaderTitle: document.getElementById('friends-list-header-title'),
  friendsCardsScroller: document.getElementById('friends-cards-scroller'),
  pendingRequestsCount: document.getElementById('pending-requests-count'),

  // Chat Area
  chatArea: document.getElementById('chat-area'),
  messagesScroller: document.getElementById('messages-scroller'),
  welcomeTitle: document.getElementById('welcome-title'),
  welcomeDesc: document.getElementById('welcome-desc'),
  messagesList: document.getElementById('messages-list'),
  typingIndicatorBar: document.getElementById('typing-indicator-bar'),
  chatInputForm: document.getElementById('chat-input-form'),
  messageInput: document.getElementById('message-input'),
  fileInput: document.getElementById('file-input'),
  btnAttachFile: document.getElementById('btn-attach-file'),
  attachmentPreviewBox: document.getElementById('attachment-preview-box'),
  attachmentPreviewImg: document.getElementById('attachment-preview-img'),
  btnRemoveAttachment: document.getElementById('btn-remove-attachment'),
  btnToggleEmoji: document.getElementById('btn-toggle-emoji'),
  emojiPickerPopover: document.getElementById('emoji-picker-popover'),
  emojiSearchInput: document.getElementById('emoji-search-input'),
  emojiGrid: document.getElementById('emoji-grid'),

  // Stage View
  voiceStage: document.getElementById('voice-stage'),
  stageChannelName: document.getElementById('stage-channel-name'),
  stagePeerCount: document.getElementById('stage-peer-count'),
  stageGrid: document.getElementById('stage-grid'),
  stageBtnCam: document.getElementById('stage-btn-cam'),
  stageBtnScreen: document.getElementById('stage-btn-screen'),
  stageBtnMic: document.getElementById('stage-btn-mic'),
  stageBtnLeave: document.getElementById('stage-btn-leave'),
  btnFullscreenStage: document.getElementById('btn-fullscreen-stage'),

  // Modals
  modalCreateServer: document.getElementById('modal-create-server'),
  formCreateServer: document.getElementById('form-create-server'),
  inputServerName: document.getElementById('input-server-name'),
  btnCloseServerModal: document.getElementById('btn-close-server-modal'),
  btnCancelServerModal: document.getElementById('btn-cancel-server-modal'),

  modalJoinServer: document.getElementById('modal-join-server'),
  formJoinServer: document.getElementById('form-join-server'),
  inputJoinInvite: document.getElementById('input-join-invite'),
  btnCloseJoinModal: document.getElementById('btn-close-join-modal'),
  btnCancelJoinModal: document.getElementById('btn-cancel-join-modal'),

  modalCreateChannel: document.getElementById('modal-create-channel'),
  formCreateChannel: document.getElementById('form-create-channel'),
  inputChannelName: document.getElementById('input-channel-name'),
  channelNamePrefix: document.getElementById('channel-name-prefix'),
  btnCloseChannelModal: document.getElementById('btn-close-channel-modal'),
  btnCancelChannelModal: document.getElementById('btn-cancel-channel-modal'),
  menuCreateChannel: document.getElementById('menu-create-channel'),
  menuInvite: document.getElementById('menu-invite'),
  menuChangeServerIcon: document.getElementById('menu-change-server-icon'),
  inputEditServerIconFile: document.getElementById('input-edit-server-icon-file'),
  inputServerIconFile: document.getElementById('input-server-icon-file'),
  serverIconEmojiPreview: document.getElementById('server-icon-emoji-preview'),
  serverIconImgPreview: document.getElementById('server-icon-img-preview'),
  btnUploadServerIcon: document.getElementById('btn-upload-server-icon'),

  // Settings Modal
  modalUserSettings: document.getElementById('modal-user-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnLogoutUser: document.getElementById('btn-logout-user'),
  formSettingsProfile: document.getElementById('form-settings-profile'),
  settingsInputUsername: document.getElementById('settings-input-username'),
  settingsInputCustomStatus: document.getElementById('settings-input-custom-status'),
  settingsInputBanner: document.getElementById('settings-input-banner'),
  settingsInputAbout: document.getElementById('settings-input-about'),
  settingsPreviewAvatar: document.getElementById('settings-preview-avatar'),
  settingsPreviewName: document.getElementById('settings-preview-name'),
  settingsPreviewTag: document.getElementById('settings-preview-tag'),
  settingsPreviewBanner: document.getElementById('settings-preview-banner'),
  settingsPreviewStatus: document.getElementById('settings-preview-status'),
  inputAvatarFile: document.getElementById('input-avatar-file'),
  btnUploadAvatar: document.getElementById('btn-upload-avatar'),
  inputBannerFile: document.getElementById('input-banner-file'),
  btnUploadBanner: document.getElementById('btn-upload-banner'),
  btnTestMic: document.getElementById('btn-test-mic'),
  micTestBar: document.getElementById('mic-test-bar'),
  btnTestCam: document.getElementById('btn-test-cam'),
  settingsCamPreview: document.getElementById('settings-cam-preview'),
  camPlaceholder: document.getElementById('cam-placeholder'),

  // Discover Users
  discoverUsersList: document.getElementById('discover-users-list'),

  // Incoming Call Overlay
  incomingCallOverlay: document.getElementById('incoming-call-overlay'),
  callerAvatar: document.getElementById('caller-avatar'),
  callerName: document.getElementById('caller-name'),
  callTypeText: document.getElementById('call-type-text'),
  btnAcceptCall: document.getElementById('btn-accept-call'),
  btnDeclineCall: document.getElementById('btn-decline-call')
};

// =============================================================================
// 4. SOCKET.IO & AUTHENTICATION
// =============================================================================
function initSocket() {
  state.socket = io({
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000
  });

  state.socket.on('connect', () => {
    console.log('[Socket] Connected, ID:', state.socket.id);
    // Check if session token exists in localStorage
    const savedUserId = localStorage.getItem('discord_user_id');
    if (savedUserId && !state.isAuthenticated) {
      state.socket.emit('auth:restore-session', { userId: savedUserId });
    }
  });

  // Auth Responses
  state.socket.on('auth:register-code-sent', ({ email, debugCode, mailSent }) => {
    state.pendingVerifyEmail = email;
    dom.verifySubtitle.textContent = `${email} adresine 6 haneli doğrulama kodu gönderildi.`;
    dom.debugCodeDisplay.textContent = debugCode;
    switchAuthView('verify');
  });

  state.socket.on('auth:success', ({ user, servers, friends, friendRequests }) => {
    state.isAuthenticated = true;
    state.currentUser = user;
    state.servers = servers || [];
    state.friends = friends || [];
    state.friendRequests = friendRequests || [];

    localStorage.setItem('discord_user_id', user.id);

    // Hide auth screen, show main app
    dom.authWrapper.classList.add('hidden');
    dom.appContainer.classList.remove('hidden');

    updateSelfProfileUI();
    renderServerList();
    renderHomeView();
    updatePendingBadge();
    sounds.playJoinSound();
  });

  state.socket.on('auth:error', ({ message }) => {
    showAuthError(message);
  });

  state.socket.on('auth:session-invalid', () => {
    localStorage.removeItem('discord_user_id');
    switchAuthView('login');
  });

  // User Profile updates
  state.socket.on('user:profile-updated', (user) => {
    state.currentUser = user;
    updateSelfProfileUI();
  });

  state.socket.on('user:updated', (user) => {
    const friendIdx = state.friends.findIndex(f => f.id === user.id);
    if (friendIdx > -1) {
      state.friends[friendIdx] = { ...state.friends[friendIdx], ...user };
      if (!state.currentServer) renderFriendsList();
    }
  });

  // Friends Events
  state.socket.on('friends:request-sent', ({ request }) => {
    state.friendRequests.push(request);
    showFriendAlert('success', `Arkadaşlık isteği ${request.toUser.username} kullanıcısına gönderildi!`);
    dom.inputFriendTag.value = '';
    updatePendingBadge();
    state.socket.emit('friends:discover-users');
  });

  state.socket.on('friends:request-received', ({ request }) => {
    state.friendRequests.push(request);
    sounds.playMessagePop();
    updatePendingBadge();
    state.socket.emit('friends:discover-users');
    if (!state.currentServer && state.activeFriendsTab === 'pending') {
      renderFriendsList();
    }
  });

  state.socket.on('friends:added', ({ friend, requestId }) => {
    state.friendRequests = state.friendRequests.filter(r => r.id !== requestId);
    const existing = state.friends.find(f => f.id === friend.id);
    if (!existing) state.friends.push(friend);
    updatePendingBadge();
    state.socket.emit('friends:discover-users');
    if (!state.currentServer) renderFriendsList();
  });

  state.socket.on('friends:request-removed', ({ requestId }) => {
    state.friendRequests = state.friendRequests.filter(r => r.id !== requestId);
    updatePendingBadge();
    state.socket.emit('friends:discover-users');
    if (!state.currentServer && state.activeFriendsTab === 'pending') {
      renderFriendsList();
    }
  });

  state.socket.on('friends:status-change', ({ userId, status }) => {
    const friend = state.friends.find(f => f.id === userId);
    if (friend) {
      friend.isOnline = status === 'online';
      if (!state.currentServer && (state.activeFriendsTab === 'online' || state.activeFriendsTab === 'all')) {
        renderFriendsList();
      }
    }
  });

  state.socket.on('friends:discovered-list', (users) => {
    renderDiscoveredUsers(users);
  });

  state.socket.on('friends:error', ({ message }) => {
    showFriendAlert('error', message);
  });

  // Server Events
  state.socket.on('server:created', (newServer) => {
    state.servers.push(newServer);
    renderServerList();
    selectServer(newServer);
  });

  state.socket.on('server:joined', (server) => {
    const existing = state.servers.find(s => s.id === server.id);
    if (!existing) state.servers.push(server);
    renderServerList();
    selectServer(server);
  });

  state.socket.on('server:updated', (updatedServer) => {
    const idx = state.servers.findIndex(s => s.id === updatedServer.id);
    if (idx > -1) {
      state.servers[idx] = updatedServer;
      if (state.currentServer && state.currentServer.id === updatedServer.id) {
        state.currentServer = updatedServer;
        dom.currentServerTitle.textContent = updatedServer.name;
      }
      renderServerList();
    }
  });

  state.socket.on('server:error', ({ message }) => {
    alert(message);
  });

  state.socket.on('channel:added', ({ serverId, categoryId, channel }) => {
    const s = state.servers.find(srv => srv.id === serverId);
    if (s) {
      const cat = s.categories.find(c => c.id === categoryId) || s.categories[0];
      if (cat) cat.channels.push(channel);
      if (state.currentServer && state.currentServer.id === serverId) {
        renderChannelsList();
      }
    }
  });

  // Messages Events
  state.socket.on('messages:history', ({ channelId, messages }) => {
    if (state.currentChannel && state.currentChannel.id === channelId) {
      renderMessagesList(messages);
    }
  });

  state.socket.on('message:new', (msg) => {
    if (state.currentChannel && state.currentChannel.id === msg.channelId) {
      appendSingleMessage(msg);
      if (msg.userId !== state.currentUser.id) sounds.playMessagePop();
    }
  });

  state.socket.on('message:reaction-updated', ({ channelId, messageId, reactions }) => {
    if (state.currentChannel && state.currentChannel.id === channelId) {
      updateMessageReactions(messageId, reactions);
    }
  });

  state.socket.on('typing:status', ({ channelId, user, isTyping }) => {
    if (state.currentChannel && state.currentChannel.id === channelId) {
      dom.typingIndicatorBar.textContent = isTyping ? `${user.username} yazıyor...` : '';
    }
  });

  // WebRTC Setup
  setupWebRTCSignaling();
}

// Switch between Login, Register, Verify views
function switchAuthView(viewName) {
  dom.authViewLogin.classList.toggle('hidden', viewName !== 'login');
  dom.authViewRegister.classList.toggle('hidden', viewName !== 'register');
  dom.authViewVerify.classList.toggle('hidden', viewName !== 'verify');
  clearAuthErrors();
}

function showAuthError(msg) {
  const activeError = !dom.authViewLogin.classList.contains('hidden')
    ? dom.loginErrorBanner
    : !dom.authViewRegister.classList.contains('hidden')
    ? dom.registerErrorBanner
    : dom.verifyErrorBanner;

  activeError.textContent = msg;
  activeError.classList.remove('hidden');
}

function clearAuthErrors() {
  dom.loginErrorBanner.classList.add('hidden');
  dom.registerErrorBanner.classList.add('hidden');
  dom.verifyErrorBanner.classList.add('hidden');
}

// Setup Auth Forms
function setupAuthForms() {
  // Go to Register
  dom.btnGoToRegister.addEventListener('click', () => {
    switchAuthView('register');
  });

  // Go to Login
  dom.btnGoToLogin.addEventListener('click', () => {
    switchAuthView('login');
  });

  dom.btnBackToRegister.addEventListener('click', () => {
    switchAuthView('register');
  });

  // Login Submit
  dom.formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthErrors();
    const email = dom.loginEmail.value.trim();
    const password = dom.loginPassword.value;
    state.socket.emit('auth:login', { email, password });
  });

  // Register Submit
  dom.formRegister.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthErrors();
    const email = dom.regEmail.value.trim();
    const username = dom.regUsername.value.trim();
    const password = dom.regPassword.value;
    state.socket.emit('auth:register-request', { email, username, password });
  });

  // OTP Verification Submit
  dom.formVerify.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthErrors();
    const code = dom.verifyCodeInput.value.trim();
    state.socket.emit('auth:verify-code', {
      email: state.pendingVerifyEmail,
      code
    });
  });

  // Logout
  dom.btnLogoutUser.addEventListener('click', () => {
    localStorage.removeItem('discord_user_id');
    location.reload();
  });
}

// =============================================================================
// 5. FRIENDS HUB & DIRECT MESSAGING
// =============================================================================
function renderHomeView() {
  state.currentServer = null;
  state.currentChannel = null;

  dom.btnHome.classList.add('active');
  document.querySelectorAll('.guild-item').forEach(el => el.classList.remove('active'));
  dom.btnHome.classList.add('active');

  dom.currentServerTitle.textContent = 'Doğrudan Mesajlar';

  // Show Friends Header, hide Server Channel Header
  dom.headerServerChannelView.classList.add('hidden');
  dom.headerFriendsView.classList.remove('hidden');
  dom.btnStartDmVoice.classList.add('hidden');
  dom.btnStartDmVideo.classList.add('hidden');

  // Show Friends Hub, hide Chat Area & Stage
  dom.friendsHub.classList.remove('hidden');
  dom.chatArea.classList.add('hidden');
  dom.voiceStage.classList.add('hidden');

  renderDirectMessagesSidebar();
  renderFriendsList();
}

function renderDirectMessagesSidebar() {
  dom.channelsScroller.innerHTML = `
    <div class="channel-category">
      <div class="category-header">
        <div class="category-title-wrap"><span>ARKADAŞLAR</span></div>
      </div>
      <div class="channel-item active" id="btn-sidebar-friends">
        <svg class="channel-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span class="channel-title">Arkadaşlar</span>
      </div>
    </div>

    <div class="channel-category">
      <div class="category-header">
        <div class="category-title-wrap"><span>DOĞRUDAN MESAJLAR</span></div>
      </div>
      <div class="dm-users-list" id="dm-users-list"></div>
    </div>
  `;

  document.getElementById('btn-sidebar-friends').addEventListener('click', () => {
    renderHomeView();
  });

  const dmList = document.getElementById('dm-users-list');
  if (state.friends.length === 0) {
    dmList.innerHTML = `<div style="padding: 10px; font-size: 13px; color: var(--text-muted);">Henüz arkadaş eklemedin.</div>`;
  } else {
    state.friends.forEach(friend => {
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.innerHTML = `
        <div class="voice-member-avatar" style="width: 28px; height: 28px;">
          <img src="${friend.avatar}" alt="Avatar">
        </div>
        <span class="channel-title">${escapeHtml(friend.username)}</span>
      `;
      item.addEventListener('click', () => openDirectMessage(friend));
      dmList.appendChild(item);
    });
  }
}

function renderFriendsList() {
  dom.friendsCardsScroller.innerHTML = '';
  const tab = state.activeFriendsTab;

  if (tab === 'add') {
    dom.paneFriendsAdd.classList.remove('hidden');
    dom.paneFriendsAdd.classList.add('active');
    dom.paneFriendsList.classList.add('hidden');
    dom.paneFriendsList.classList.remove('active');
    state.socket.emit('friends:discover-users');
    return;
  }

  dom.paneFriendsAdd.classList.add('hidden');
  dom.paneFriendsAdd.classList.remove('active');
  dom.paneFriendsList.classList.remove('hidden');
  dom.paneFriendsList.classList.add('active');

  let listToDisplay = [];

  if (tab === 'online') {
    listToDisplay = state.friends.filter(f => f.isOnline);
    dom.friendsListHeaderTitle.textContent = `ÇEVRİMİÇİ — ${listToDisplay.length}`;
  } else if (tab === 'all') {
    listToDisplay = state.friends;
    dom.friendsListHeaderTitle.textContent = `TÜM ARKADAŞLAR — ${listToDisplay.length}`;
  } else if (tab === 'pending') {
    renderPendingRequests();
    return;
  }

  if (listToDisplay.length === 0) {
    dom.friendsCardsScroller.innerHTML = `
      <div class="friends-empty-placeholder">
        <svg viewBox="0 0 24 24" width="60" height="60" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        <p>${tab === 'online' ? 'Şu anda hiç çevrimiçi arkadaşın yok.' : 'Henüz hiç arkadaş eklemedin.'}</p>
        <button type="button" class="btn-primary" id="btn-empty-go-add" style="margin-top: 14px; font-size: 13px; padding: 8px 18px; border-radius: 4px;">Arkadaş Ekle Sekmesine Git</button>
      </div>
    `;
    const btnGoAdd = document.getElementById('btn-empty-go-add');
    if (btnGoAdd) {
      btnGoAdd.addEventListener('click', () => {
        document.querySelectorAll('.friends-tab-item').forEach(b => b.classList.remove('active'));
        const addTabBtn = document.querySelector('.friends-tab-item[data-tab="add"]');
        if (addTabBtn) addTabBtn.classList.add('active');
        state.activeFriendsTab = 'add';
        renderFriendsList();
      });
    }
    return;
  }

  listToDisplay.forEach(friend => {
    const card = document.createElement('div');
    card.className = 'friend-card-row';

    card.innerHTML = `
      <div class="friend-card-user">
        <div class="friend-card-avatar">
          <img src="${friend.avatar}" alt="Avatar">
          <div class="status-indicator status-${friend.isOnline ? (friend.status || 'online') : 'offline'}"></div>
        </div>
        <div class="friend-card-names">
          <span class="friend-card-username">${escapeHtml(friend.username)} <span class="friend-card-tag">#${friend.tag}</span></span>
          <span class="friend-card-status">${friend.isOnline ? (escapeHtml(friend.customStatus) || 'Çevrimiçi') : 'Çevrimdışı'}</span>
        </div>
      </div>

      <div class="friend-card-actions">
        <button class="friend-action-circle-btn" title="Mesaj Gönder" onclick="openDirectMessageById('${friend.id}')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
    `;

    dom.friendsCardsScroller.appendChild(card);
  });
}

function renderPendingRequests() {
  dom.friendsListHeaderTitle.textContent = `BEKLEYEN İSTEKLER — ${state.friendRequests.length}`;

  if (state.friendRequests.length === 0) {
    dom.friendsCardsScroller.innerHTML = `
      <div class="friends-empty-placeholder">
        <svg viewBox="0 0 24 24" width="60" height="60" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p>Bekleyen arkadaşlık isteğin yok.</p>
        <button type="button" class="btn-primary" id="btn-empty-go-add-pending" style="margin-top: 14px; font-size: 13px; padding: 8px 18px; border-radius: 4px;">Arkadaş Ekle Sekmesine Git</button>
      </div>
    `;
    const btnGoAdd = document.getElementById('btn-empty-go-add-pending');
    if (btnGoAdd) {
      btnGoAdd.addEventListener('click', () => {
        document.querySelectorAll('.friends-tab-item').forEach(b => b.classList.remove('active'));
        const addTabBtn = document.querySelector('.friends-tab-item[data-tab="add"]');
        if (addTabBtn) addTabBtn.classList.add('active');
        state.activeFriendsTab = 'add';
        renderFriendsList();
      });
    }
    return;
  }

  state.friendRequests.forEach(req => {
    const isIncoming = req.type === 'incoming';
    const otherUser = isIncoming ? req.fromUser : req.toUser;

    const card = document.createElement('div');
    card.className = 'friend-card-row';

    card.innerHTML = `
      <div class="friend-card-user">
        <div class="friend-card-avatar">
          <img src="${otherUser.avatar}" alt="Avatar">
        </div>
        <div class="friend-card-names">
          <span class="friend-card-username">${escapeHtml(otherUser.username)} <span class="friend-card-tag">#${otherUser.tag}</span></span>
          <span class="friend-card-status">${isIncoming ? 'Gelen Arkadaşlık İsteği' : 'Giden İstek'}</span>
        </div>
      </div>

      <div class="friend-card-actions">
        ${isIncoming ? `
          <button class="friend-action-circle-btn accept" title="Kabul Et" onclick="acceptFriendRequest('${req.id}')">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        ` : ''}
        <button class="friend-action-circle-btn reject" title="İptal / Reddet" onclick="rejectFriendRequest('${req.id}')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    dom.friendsCardsScroller.appendChild(card);
  });
}

function updatePendingBadge() {
  const count = state.friendRequests.filter(r => r.type === 'incoming').length;
  if (count > 0) {
    dom.pendingRequestsCount.textContent = count;
    dom.pendingRequestsCount.classList.remove('hidden');
  } else {
    dom.pendingRequestsCount.classList.add('hidden');
  }
}

window.acceptFriendRequest = function(reqId) {
  state.socket.emit('friends:accept-request', { requestId: reqId });
};

window.rejectFriendRequest = function(reqId) {
  state.socket.emit('friends:reject-request', { requestId: reqId });
};

window.openDirectMessageById = function(userId) {
  const friend = state.friends.find(f => f.id === userId);
  if (friend) openDirectMessage(friend);
};

function openDirectMessage(friend) {
  const dmChannelId = [state.currentUser.id, friend.id].sort().join('_');
  const dmChannel = {
    id: dmChannelId,
    name: friend.username,
    type: 'dm',
    targetUser: friend
  };

  // Switch from Friends Hub to Chat Area
  dom.friendsHub.classList.add('hidden');
  dom.chatArea.classList.remove('hidden');
  dom.headerFriendsView.classList.add('hidden');
  dom.headerServerChannelView.classList.remove('hidden');

  dom.btnStartDmVoice.classList.remove('hidden');
  dom.btnStartDmVideo.classList.remove('hidden');

  dom.btnStartDmVoice.onclick = () => {
    state.socket.emit('dm:call-start', { targetUserId: friend.id, hasVideo: false });
    joinVoiceChannel({ id: `dm_${friend.id}`, name: `${friend.username} ile Arama`, type: 'voice' }, null);
  };

  dom.btnStartDmVideo.onclick = () => {
    state.socket.emit('dm:call-start', { targetUserId: friend.id, hasVideo: true });
    state.isVideoOn = true;
    joinVoiceChannel({ id: `dm_${friend.id}`, name: `${friend.username} ile Görüntülü Arama`, type: 'voice' }, null);
  };

  selectChannel(dmChannel);
}

function showFriendAlert(type, text) {
  dom.friendRequestAlert.className = `friend-request-alert ${type}`;
  dom.friendRequestAlert.textContent = text;
  dom.friendRequestAlert.classList.remove('hidden');
}

// Render Discovered Users List (Suggestions)
function renderDiscoveredUsers(users) {
  if (!dom.discoverUsersList) return;
  dom.discoverUsersList.innerHTML = '';

  if (!users || users.length === 0) {
    dom.discoverUsersList.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 12px 16px; background-color: var(--bg-servers); border-radius: 6px; font-size: 13px; color: var(--text-muted); border: 1px dashed var(--border-subtle);">
        Henüz önerilecek başka kullanıcı yok. Yukarıdaki kutuya bir kullanıcı adı (Örn: cinar#8899) yazarak ekleyebilirsin.
      </div>
    `;
    return;
  }

  users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'discover-user-card';

    const avatarImg = `<img src="${user.avatar}" alt="${escapeHtml(user.username)}">`;

    card.innerHTML = `
      <div class="discover-user-info">
        <div class="discover-user-avatar">
          ${avatarImg}
          <div class="status-indicator status-${user.isOnline ? (user.status || 'online') : 'offline'}"></div>
        </div>
        <div class="discover-user-names">
          <span class="discover-user-username">${escapeHtml(user.username)}</span>
          <span class="discover-user-tag">#${user.tag || '0000'}</span>
        </div>
      </div>
      <div>
        ${user.hasPendingRequest ? `
          <button class="btn-discover-add sent" disabled>İstek Gönderildi</button>
        ` : `
          <button class="btn-discover-add" onclick="sendFriendRequestTo('${escapeHtml(user.username)}#${user.tag}')">+ Arkadaş Ekle</button>
        `}
      </div>
    `;

    dom.discoverUsersList.appendChild(card);
  });
}

window.sendFriendRequestTo = function(tagInput) {
  state.socket.emit('friends:send-request', { tagInput });
};

// Friends Hub Tabs click
document.querySelectorAll('.friends-tab-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.friends-tab-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFriendsTab = btn.dataset.tab;
    renderFriendsList();
  });
});

// Add Friend Form
dom.formAddFriend.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = dom.inputFriendTag.value.trim();
  if (!input) return;
  state.socket.emit('friends:send-request', { tagInput: input });
});

// =============================================================================
// 6. SERVERS & CHANNELS MANAGEMENT
// =============================================================================
function renderServerList() {
  dom.guildList.innerHTML = '';

  state.servers.forEach(server => {
    const item = document.createElement('div');
    item.className = 'guild-item';
    if (state.currentServer && state.currentServer.id === server.id) {
      item.classList.add('active');
    }
    item.dataset.tooltip = server.name;

    const isImageIcon = server.icon && (server.icon.startsWith('data:image') || server.icon.startsWith('http'));
    const iconContent = isImageIcon
      ? `<img src="${server.icon}" alt="${escapeHtml(server.name)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`
      : escapeHtml(server.icon || '🚀');

    item.innerHTML = `
      <div class="guild-pill"></div>
      <div class="guild-icon">${iconContent}</div>
    `;

    item.addEventListener('click', () => selectServer(server));
    dom.guildList.appendChild(item);
  });
}

function selectServer(server) {
  state.currentServer = server;
  dom.btnHome.classList.remove('active');

  document.querySelectorAll('.guild-item').forEach(el => el.classList.remove('active'));
  const found = Array.from(dom.guildList.children).find(el => el.dataset.tooltip === server.name);
  if (found) found.classList.add('active');

  dom.currentServerTitle.textContent = server.name;

  // Switch views
  dom.headerFriendsView.classList.add('hidden');
  dom.headerServerChannelView.classList.remove('hidden');
  dom.friendsHub.classList.add('hidden');
  dom.chatArea.classList.remove('hidden');
  dom.btnStartDmVoice.classList.add('hidden');
  dom.btnStartDmVideo.classList.add('hidden');

  renderChannelsList();

  // Select first text channel
  let firstTextChannel = null;
  for (const cat of server.categories) {
    firstTextChannel = cat.channels.find(c => c.type === 'text');
    if (firstTextChannel) break;
  }
  if (firstTextChannel) selectChannel(firstTextChannel);
}

function renderChannelsList() {
  dom.channelsScroller.innerHTML = '';
  if (!state.currentServer) return;

  state.currentServer.categories.forEach(category => {
    const catEl = document.createElement('div');
    catEl.className = 'channel-category';

    catEl.innerHTML = `
      <div class="category-header">
        <div class="category-title-wrap"><span>${escapeHtml(category.name)}</span></div>
        <button class="btn-add-channel-quick" title="Kanal Oluştur">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="category-channels-container"></div>
    `;

    const channelsContainer = catEl.querySelector('.category-channels-container');
    const addQuickBtn = catEl.querySelector('.btn-add-channel-quick');
    addQuickBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCreateChannelModal(category.id);
    });

    category.channels.forEach(chan => {
      const chanEl = document.createElement('div');
      chanEl.className = 'channel-item';
      if (state.currentChannel && state.currentChannel.id === chan.id) {
        chanEl.classList.add('active');
      }

      const iconSvg = chan.type === 'voice'
        ? `<svg class="channel-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`
        : `<svg class="channel-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`;

      chanEl.innerHTML = `
        ${iconSvg}
        <span class="channel-title">${escapeHtml(chan.name)}</span>
      `;

      chanEl.addEventListener('click', () => {
        if (chan.type === 'voice') {
          joinVoiceChannel(chan, state.currentServer);
        } else {
          selectChannel(chan);
        }
      });

      channelsContainer.appendChild(chanEl);

      if (chan.type === 'voice') {
        const wrap = document.createElement('div');
        wrap.className = 'voice-participants-list';
        wrap.id = `voice-users-${chan.id}`;
        channelsContainer.appendChild(wrap);
      }
    });

    dom.channelsScroller.appendChild(catEl);
  });
}

function selectChannel(channel) {
  state.currentChannel = channel;
  toggleStageView(false);

  dom.headerChannelName.textContent = channel.name;
  dom.headerChannelTopic.textContent = channel.topic || 'Sohbet';
  dom.messageInput.placeholder = `# ${channel.name} kanalına mesaj gönder`;

  dom.welcomeTitle.textContent = `# ${channel.name} kanalına hoş geldin!`;
  dom.welcomeDesc.textContent = `Bu, #${channel.name} kanalının başlangıcıdır.`;

  document.querySelectorAll('.channel-item').forEach(el => {
    if (el.textContent.trim().includes(channel.name)) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  state.socket.emit('messages:get', { channelId: channel.id });
}

// =============================================================================
// 7. WEBRTC & VOICE / VIDEO / SCREEN SHARING
// =============================================================================
function setupWebRTCSignaling() {
  state.socket.on('voice:existing-peers', async ({ peers }) => {
    for (const peer of peers) {
      if (peer.socketId !== state.socket.id) {
        await createPeerConnection(peer.socketId, true);
      }
    }
  });

  state.socket.on('voice:peer-joined', async ({ peer }) => {
    sounds.playJoinSound();
    await createPeerConnection(peer.socketId, false);
  });

  state.socket.on('voice:signal', async ({ senderSocketId, signal }) => {
    let pc = state.peerConnections.get(senderSocketId);
    if (!pc) pc = await createPeerConnection(senderSocketId, false);

    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        state.socket.emit('voice:signal', {
          targetSocketId: senderSocketId,
          signal: { sdp: pc.localDescription }
        });
      }
    } else if (signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (e) {
        console.warn(e);
      }
    }
  });

  state.socket.on('voice:peer-left', ({ socketId }) => {
    closePeerConnection(socketId);
    removeParticipantFromStage(socketId);
    sounds.playLeaveSound();
  });

  state.socket.on('voice:peer-speaking', ({ socketId, isSpeaking }) => {
    setPeerSpeakingUI(socketId, isSpeaking);
  });

  state.socket.on('voice:room-state', ({ channelId, users }) => {
    updateVoiceChannelMembersBadge(channelId, users);
    if (state.activeVoiceChannel && state.activeVoiceChannel.id === channelId) {
      dom.stagePeerCount.textContent = `${users.length} Katılımcı`;
    }
  });

  state.socket.on('dm:incoming-call', ({ caller, hasVideo }) => {
    showIncomingCallDialog(caller, hasVideo);
  });
}

async function createPeerConnection(remoteSocketId, isInitiator) {
  if (state.peerConnections.has(remoteSocketId)) {
    return state.peerConnections.get(remoteSocketId);
  }

  const pc = new RTCPeerConnection(rtcConfig);
  state.peerConnections.set(remoteSocketId, pc);

  if (state.localStream) {
    state.localStream.getTracks().forEach(t => pc.addTrack(t, state.localStream));
  }
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(t => pc.addTrack(t, state.screenStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      state.socket.emit('voice:signal', {
        targetSocketId: remoteSocketId,
        signal: { candidate: event.candidate }
      });
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    handleRemoteStream(remoteSocketId, stream, event.track.kind);
  };

  if (isInitiator) {
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    state.socket.emit('voice:signal', {
      targetSocketId: remoteSocketId,
      signal: { sdp: pc.localDescription }
    });
  }

  return pc;
}

function closePeerConnection(socketId) {
  const pc = state.peerConnections.get(socketId);
  if (pc) {
    pc.close();
    state.peerConnections.delete(socketId);
  }
}

async function joinVoiceChannel(channel, server) {
  if (state.activeVoiceChannel && state.activeVoiceChannel.id === channel.id) {
    toggleStageView(true);
    return;
  }

  if (state.activeVoiceChannel) leaveVoiceChannel(false);

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: state.isVideoOn
    });
  } catch (err) {
    console.warn('Microphone fallback:', err);
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const actx = new AudioCtx();
      const osc = actx.createOscillator();
      const dst = osc.connect(actx.createMediaStreamDestination());
      osc.start();
      state.localStream = dst.stream;
    }
  }

  state.activeVoiceChannel = channel;
  sounds.playJoinSound();
  setupLocalAudioAnalyzer();

  dom.voiceDock.classList.remove('hidden');
  dom.voiceDockTitle.textContent = 'Ses Bağlandı / RTC';
  dom.voiceDockChannel.textContent = `${server ? server.name + ' / ' : ''}${channel.name}`;
  dom.stageChannelName.textContent = channel.name;

  renderLocalParticipantOnStage();
  toggleStageView(true);

  state.socket.emit('voice:join', { channelId: channel.id, serverId: server ? server.id : null });
}

function leaveVoiceChannel(playAudio = true) {
  if (!state.activeVoiceChannel) return;
  if (playAudio) sounds.playLeaveSound();

  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(t => t.stop());
    state.screenStream = null;
  }

  state.peerConnections.forEach(pc => pc.close());
  state.peerConnections.clear();

  if (state.speakingInterval) {
    clearInterval(state.speakingInterval);
    state.speakingInterval = null;
  }

  state.socket.emit('voice:leave');
  state.activeVoiceChannel = null;
  state.isScreenSharing = false;
  state.isVideoOn = false;

  dom.voiceDock.classList.add('hidden');
  toggleStageView(false);
  dom.stageGrid.innerHTML = '';
}

async function toggleCamera() {
  state.isVideoOn = !state.isVideoOn;
  dom.dockBtnCamera.classList.toggle('active', state.isVideoOn);
  dom.stageBtnCam.classList.toggle('active', state.isVideoOn);

  if (state.isVideoOn) {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = camStream.getVideoTracks()[0];
      if (state.localStream) state.localStream.addTrack(track);
      else state.localStream = camStream;

      state.peerConnections.forEach(pc => pc.addTrack(track, state.localStream));
      renderLocalParticipantOnStage();
    } catch (e) {
      state.isVideoOn = false;
      dom.dockBtnCamera.classList.remove('active');
      dom.stageBtnCam.classList.remove('active');
    }
  } else {
    if (state.localStream) {
      const track = state.localStream.getVideoTracks()[0];
      if (track) { track.stop(); state.localStream.removeTrack(track); }
    }
    renderLocalParticipantOnStage();
  }
  state.socket.emit('voice:state-change', { isVideoOn: state.isVideoOn });
}

async function toggleScreenShare() {
  if (!state.activeVoiceChannel) {
    alert('Ekran paylaşmak için önce bir ses kanalına katılmalısınız!');
    return;
  }

  if (state.isScreenSharing) {
    stopScreenShare();
  } else {
    try {
      state.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      });
      state.isScreenSharing = true;
      dom.dockBtnScreen.classList.add('active');
      dom.stageBtnScreen.classList.add('active');

      const track = state.screenStream.getVideoTracks()[0];
      state.peerConnections.forEach(pc => pc.addTrack(track, state.screenStream));

      track.onended = () => stopScreenShare();
      renderScreenShareOnStage(state.screenStream, `${state.currentUser.username} - Ekran Paylaşımı`);
      state.socket.emit('voice:state-change', { isScreenSharing: true });
    } catch (e) {
      state.isScreenSharing = false;
      dom.dockBtnScreen.classList.remove('active');
      dom.stageBtnScreen.classList.remove('active');
    }
  }
}

function stopScreenShare() {
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(t => t.stop());
    state.screenStream = null;
  }
  state.isScreenSharing = false;
  dom.dockBtnScreen.classList.remove('active');
  dom.stageBtnScreen.classList.remove('active');

  const card = document.getElementById('local-screen-share-card');
  if (card) card.remove();
  state.socket.emit('voice:state-change', { isScreenSharing: false });
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  sounds.playMuteSound(state.isMuted);

  dom.iconMicOn.classList.toggle('hidden', state.isMuted);
  dom.iconMicOff.classList.toggle('hidden', !state.isMuted);

  if (state.localStream) {
    state.localStream.getAudioTracks().forEach(t => { t.enabled = !state.isMuted; });
  }
  state.socket.emit('voice:state-change', { isMuted: state.isMuted });
}

function toggleDeafen() {
  state.isDeafened = !state.isDeafened;
  sounds.playDeafenSound(state.isDeafened);

  dom.iconDeafenOn.classList.toggle('hidden', state.isDeafened);
  dom.iconDeafenOff.classList.toggle('hidden', !state.isDeafened);

  if (state.isDeafened && !state.isMuted) toggleMute();

  document.querySelectorAll('.remote-voice-audio').forEach(audio => {
    audio.muted = state.isDeafened;
  });

  state.socket.emit('voice:state-change', { isDeafened: state.isDeafened });
}

function setupLocalAudioAnalyzer() {
  if (!state.localStream || state.localStream.getAudioTracks().length === 0) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioCtx();
    const source = state.audioContext.createMediaStreamSource(state.localStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    source.connect(state.analyser);

    const buf = new Uint8Array(state.analyser.frequencyBinCount);
    let wasSpeaking = false;

    state.speakingInterval = setInterval(() => {
      if (state.isMuted) return;
      state.analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      const isSpeaking = (sum / buf.length) > 14;

      if (isSpeaking !== wasSpeaking) {
        wasSpeaking = isSpeaking;
        setPeerSpeakingUI(state.socket.id, isSpeaking);
        state.socket.emit('voice:speaking', { isSpeaking });
      }
    }, 100);
  } catch (e) {
    console.warn(e);
  }
}

function toggleStageView(show) {
  dom.voiceStage.classList.toggle('hidden', !show);
  dom.chatArea.classList.toggle('hidden', show);
}

function renderLocalParticipantOnStage() {
  let card = document.getElementById('stage-card-local');
  if (!card) {
    card = document.createElement('div');
    card.className = 'stage-card';
    card.id = 'stage-card-local';
    dom.stageGrid.appendChild(card);
  }

  const hasVideo = state.localStream && state.localStream.getVideoTracks().length > 0 && state.isVideoOn;

  if (hasVideo) {
    card.innerHTML = `
      <video id="local-video-preview" autoplay playsinline muted></video>
      <div class="stage-card-badge"><span>${escapeHtml(state.currentUser.username)} (Sen)</span></div>
    `;
    card.querySelector('#local-video-preview').srcObject = state.localStream;
  } else {
    card.innerHTML = `
      <div class="stage-card-avatar-wrap"><img src="${state.currentUser.avatar}" alt="Avatar"></div>
      <div class="stage-card-badge"><span>${escapeHtml(state.currentUser.username)} (Sen)</span></div>
    `;
  }
}

function renderScreenShareOnStage(stream, title) {
  let card = document.getElementById('local-screen-share-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'stage-card screen-share-card';
    card.id = 'local-screen-share-card';
    dom.stageGrid.prepend(card);
  }

  card.innerHTML = `
    <video autoplay playsinline muted></video>
    <div class="stage-card-badge">
      <span class="live-pill" style="margin-right: 4px;">CANLI</span>
      <span>${escapeHtml(title)}</span>
    </div>
  `;
  card.querySelector('video').srcObject = stream;
}

function handleRemoteStream(socketId, stream, kind) {
  const isVideo = kind === 'video' || stream.getVideoTracks().length > 0;
  let card = document.getElementById(`stage-card-${socketId}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'stage-card';
    card.id = `stage-card-${socketId}`;
    dom.stageGrid.appendChild(card);
  }

  if (isVideo) {
    card.innerHTML = `
      <video id="video-${socketId}" autoplay playsinline></video>
      <div class="stage-card-badge"><span>Katılımcı</span></div>
    `;
    card.querySelector(`#video-${socketId}`).srcObject = stream;
  } else {
    card.innerHTML = `
      <audio id="audio-${socketId}" class="remote-voice-audio" autoplay></audio>
      <div class="stage-card-avatar-wrap"><img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${socketId}" alt="Avatar"></div>
      <div class="stage-card-badge"><span>Katılımcı</span></div>
    `;
    const aud = card.querySelector(`#audio-${socketId}`);
    aud.srcObject = stream;
    aud.muted = state.isDeafened;
  }
}

function removeParticipantFromStage(socketId) {
  const card = document.getElementById(`stage-card-${socketId}`);
  if (card) card.remove();
}

function setPeerSpeakingUI(socketId, isSpeaking) {
  const isSelf = socketId === state.socket.id;
  const card = document.getElementById(isSelf ? 'stage-card-local' : `stage-card-${socketId}`);
  if (card) card.classList.toggle('speaking', isSpeaking);
}

function updateVoiceChannelMembersBadge(channelId, users) {
  const wrap = document.getElementById(`voice-users-${channelId}`);
  if (!wrap) return;
  wrap.innerHTML = '';
  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'voice-member-item';
    item.innerHTML = `
      <div class="voice-member-avatar"><img src="${u.avatar}" alt="Avatar"></div>
      <span>${escapeHtml(u.username)}</span>
    `;
    wrap.appendChild(item);
  });
}

function showIncomingCallDialog(caller) {
  dom.callerAvatar.src = caller.avatar;
  dom.callerName.textContent = caller.username;
  dom.incomingCallOverlay.classList.remove('hidden');
  sounds.startRingtone();

  dom.btnAcceptCall.onclick = () => {
    sounds.stopRingtone();
    dom.incomingCallOverlay.classList.add('hidden');
    joinVoiceChannel({ id: `dm_${caller.id}`, name: `${caller.username} ile Arama`, type: 'voice' }, null);
  };

  dom.btnDeclineCall.onclick = () => {
    sounds.stopRingtone();
    dom.incomingCallOverlay.classList.add('hidden');
  };
}

// =============================================================================
// 8. CHAT & MESSAGING
// =============================================================================
function renderMessagesList(messages) {
  dom.messagesList.innerHTML = '';
  messages.forEach(msg => appendSingleMessage(msg, false));
  scrollToBottom();
}

function appendSingleMessage(msg, scroll = true) {
  const item = document.createElement('div');
  item.className = 'message-item';
  item.dataset.messageId = msg.id;

  const formattedTime = formatTimestamp(msg.timestamp);
  const formattedContent = parseMarkdown(msg.content);

  let attachmentHtml = '';
  if (msg.attachment) {
    attachmentHtml = `<img src="${msg.attachment}" class="message-attachment-image" alt="Görsel" onclick="window.open('${msg.attachment}')">`;
  }

  const reactionsHtml = renderReactionsHtml(msg.reactions || {}, msg.id);

  item.innerHTML = `
    <div class="message-avatar-wrap"><img src="${msg.avatar}" alt="Avatar"></div>
    <div class="message-body">
      <div class="message-meta">
        <span class="message-author">${escapeHtml(msg.username)}</span>
        <span class="message-timestamp">${formattedTime}</span>
      </div>
      <div class="message-content">${formattedContent}</div>
      ${attachmentHtml}
      <div class="reactions-wrapper" id="reactions-${msg.id}">${reactionsHtml}</div>
    </div>
    <div class="message-actions-bar">
      <button class="msg-action-btn" title="Tepki Ekle" onclick="toggleReaction('${msg.id}', '❤️')">❤️</button>
      <button class="msg-action-btn" title="Tepki Ekle" onclick="toggleReaction('${msg.id}', '👍')">👍</button>
      <button class="msg-action-btn" title="Tepki Ekle" onclick="toggleReaction('${msg.id}', '🔥')">🔥</button>
      <button class="msg-action-btn" title="Tepki Ekle" onclick="toggleReaction('${msg.id}', '🎮')">🎮</button>
    </div>
  `;

  dom.messagesList.appendChild(item);
  if (scroll) scrollToBottom();
}

function renderReactionsHtml(reactions, msgId) {
  let html = '';
  for (const [emoji, usersList] of Object.entries(reactions)) {
    if (!usersList || usersList.length === 0) continue;
    const hasReacted = state.currentUser && usersList.includes(state.currentUser.id);
    html += `
      <div class="reaction-pill ${hasReacted ? 'active' : ''}" onclick="toggleReaction('${msgId}', '${emoji}')">
        <span>${emoji}</span>
        <span class="reaction-count">${usersList.length}</span>
      </div>
    `;
  }
  return html;
}

window.toggleReaction = function(messageId, emoji) {
  if (!state.currentChannel) return;
  state.socket.emit('message:react', { channelId: state.currentChannel.id, messageId, emoji });
};

function updateMessageReactions(messageId, reactions) {
  const el = document.getElementById(`reactions-${messageId}`);
  if (el) el.innerHTML = renderReactionsHtml(reactions, messageId);
}

function scrollToBottom() {
  dom.messagesScroller.scrollTop = dom.messagesScroller.scrollHeight;
}

function parseMarkdown(text) {
  if (!text) return '';
  let str = escapeHtml(text);
  str = str.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
  str = str.replace(/`([^`]+)`/g, '<code class="code-block" style="display:inline;padding:2px 6px;">$1</code>');
  str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/@everyone/g, '<span class="mention">@everyone</span>');
  str = str.replace(/@([a-zA-Z0-9_-]+)/g, '<span class="mention">@$1</span>');
  return str;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatTimestamp(isoStr) {
  const date = new Date(isoStr);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `Bugün ${hours}:${minutes}`;
}

// Chat Input Handlers
dom.chatInputForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = dom.messageInput.value.trim();
  const attachment = state.activeAttachment;
  if (!text && !attachment) return;
  if (!state.currentChannel) return;

  state.socket.emit('message:send', { channelId: state.currentChannel.id, content: text, attachment });
  dom.messageInput.value = '';
  clearAttachment();
  state.socket.emit('typing:stop', { channelId: state.currentChannel.id });
});

dom.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    dom.chatInputForm.dispatchEvent(new Event('submit'));
    return;
  }
  if (state.currentChannel) {
    if (!state.isTyping) {
      state.isTyping = true;
      state.socket.emit('typing:start', { channelId: state.currentChannel.id });
    }
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      state.isTyping = false;
      state.socket.emit('typing:stop', { channelId: state.currentChannel.id });
    }, 1500);
  }
});

dom.btnAttachFile.addEventListener('click', () => dom.fileInput.click());
dom.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    state.activeAttachment = ev.target.result;
    dom.attachmentPreviewImg.src = state.activeAttachment;
    dom.attachmentPreviewBox.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});
dom.btnRemoveAttachment.addEventListener('click', clearAttachment);

function clearAttachment() {
  state.activeAttachment = null;
  dom.fileInput.value = '';
  dom.attachmentPreviewBox.classList.add('hidden');
}

// Emoji Picker
const DISCORD_EMOJIS = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','🤑','🤗','🤔','🤐','🤨','😐','😏','😒','🙄','😬','😴','😷','🔥','💯','✨','🎉','🎮','🚀','💻','❤️','💀','💩','👍','👎','👏','⚡','🌟'];
function initEmojiPicker() {
  dom.emojiGrid.innerHTML = '';
  DISCORD_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      dom.messageInput.value += emoji;
      dom.messageInput.focus();
      dom.emojiPickerPopover.classList.add('hidden');
    });
    dom.emojiGrid.appendChild(btn);
  });

  dom.btnToggleEmoji.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.emojiPickerPopover.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!dom.emojiPickerPopover.contains(e.target) && e.target !== dom.btnToggleEmoji) {
      dom.emojiPickerPopover.classList.add('hidden');
    }
  });
}

// =============================================================================
// 9. PROFILE & SETTINGS (WITH ROBUST ESCAPE KEY CLOSING)
// =============================================================================
function updateSelfProfileUI() {
  if (!state.currentUser) return;
  dom.selfAvatar.src = state.currentUser.avatar;
  dom.selfDisplayname.textContent = state.currentUser.username;
  dom.selfSubtext.textContent = `#${state.currentUser.tag || '0000'}`;
  dom.selfStatusDot.className = `status-indicator status-${state.currentUser.status || 'online'}`;

  dom.settingsPreviewAvatar.src = state.currentUser.avatar;
  dom.settingsPreviewName.textContent = state.currentUser.username;
  dom.settingsPreviewTag.textContent = `#${state.currentUser.tag || '0000'}`;
  dom.settingsPreviewBanner.style.background = state.currentUser.bannerColor || '#5865F2';
  dom.settingsPreviewStatus.className = `preview-status status-${state.currentUser.status || 'online'}`;

  dom.settingsInputUsername.value = state.currentUser.username;
  dom.settingsInputCustomStatus.value = state.currentUser.customStatus || '';
  dom.settingsInputBanner.value = state.currentUser.bannerColor || '#5865F2';
  dom.settingsInputAbout.value = state.currentUser.aboutMe || '';
}

function openUserSettingsModal() {
  updateSelfProfileUI();
  dom.modalUserSettings.classList.remove('hidden');
}

function closeUserSettingsModal() {
  dom.modalUserSettings.classList.add('hidden');
}

// FIXED: Close settings modal via click or ESC
dom.btnCloseSettings.addEventListener('click', closeUserSettingsModal);

// GLOBAL ESC KEY HANDLER (Works reliably on all modals!)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.keyCode === 27) {
    closeUserSettingsModal();
    dom.modalCreateServer.classList.add('hidden');
    dom.modalJoinServer.classList.add('hidden');
    dom.modalCreateChannel.classList.add('hidden');
    dom.emojiPickerPopover.classList.add('hidden');
  }
}, true); // useCapture = true ensures it intercepts Escape first!

// Settings Tabs
document.querySelectorAll('.settings-tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = document.getElementById(`pane-${btn.dataset.tab}`);
    if (pane) pane.classList.add('active');
  });
});

// Profile Form Submit
dom.formSettingsProfile.addEventListener('submit', (e) => {
  e.preventDefault();
  const selectedStatus = document.querySelector('input[name="userStatus"]:checked')?.value || 'online';
  const updates = {
    username: dom.settingsInputUsername.value.trim(),
    customStatus: dom.settingsInputCustomStatus.value.trim(),
    bannerColor: dom.settingsInputBanner.value,
    aboutMe: dom.settingsInputAbout.value.trim(),
    status: selectedStatus
  };
  state.socket.emit('user:update-profile', updates);
  closeUserSettingsModal();
});

// Avatar Presets
document.querySelectorAll('.avatar-seed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.avatar-seed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentUser.avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${btn.dataset.seed}`;
    updateSelfProfileUI();
    state.socket.emit('user:update-profile', { avatar: state.currentUser.avatar });
  });
});

// Theme selection
document.querySelectorAll('.theme-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    document.body.className = card.dataset.theme;
  });
});

// =============================================================================
// 10. MODALS (CREATE SERVER, JOIN SERVER, CREATE CHANNEL)
// =============================================================================
let targetCategoryIdForChannel = null;
let selectedServerIcon = '🚀';

document.querySelectorAll('.icon-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.icon-preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedServerIcon = btn.dataset.icon;
    if (dom.serverIconEmojiPreview && dom.serverIconImgPreview) {
      dom.serverIconEmojiPreview.textContent = selectedServerIcon;
      dom.serverIconEmojiPreview.classList.remove('hidden');
      dom.serverIconImgPreview.classList.add('hidden');
    }
  });
});

dom.btnAddServer.addEventListener('click', () => {
  dom.inputServerName.value = '';
  selectedServerIcon = '🚀';
  if (dom.serverIconEmojiPreview && dom.serverIconImgPreview) {
    dom.serverIconEmojiPreview.textContent = '🚀';
    dom.serverIconEmojiPreview.classList.remove('hidden');
    dom.serverIconImgPreview.classList.add('hidden');
  }
  document.querySelectorAll('.icon-preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.icon === '🚀');
  });
  dom.modalCreateServer.classList.remove('hidden');
});
dom.btnCloseServerModal.addEventListener('click', () => dom.modalCreateServer.classList.add('hidden'));
dom.btnCancelServerModal.addEventListener('click', () => dom.modalCreateServer.classList.add('hidden'));

dom.formCreateServer.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = dom.inputServerName.value.trim();
  if (!name) return;
  state.socket.emit('server:create', { name, icon: selectedServerIcon });
  dom.modalCreateServer.classList.add('hidden');
});

// Join server modal
dom.btnJoinServer.addEventListener('click', () => {
  dom.inputJoinInvite.value = '';
  dom.modalJoinServer.classList.remove('hidden');
});
dom.btnCloseJoinModal.addEventListener('click', () => dom.modalJoinServer.classList.add('hidden'));
dom.btnCancelJoinModal.addEventListener('click', () => dom.modalJoinServer.classList.add('hidden'));

dom.formJoinServer.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = dom.inputJoinInvite.value.trim();
  if (!code) return;
  state.socket.emit('server:join-invite', { inviteCode: code });
  dom.modalJoinServer.classList.add('hidden');
});

// Channel Modal
function openCreateChannelModal(catId) {
  targetCategoryIdForChannel = catId;
  dom.inputChannelName.value = '';
  dom.modalCreateChannel.classList.remove('hidden');
}
dom.btnCloseChannelModal.addEventListener('click', () => dom.modalCreateChannel.classList.add('hidden'));
dom.btnCancelChannelModal.addEventListener('click', () => dom.modalCreateChannel.classList.add('hidden'));

dom.formCreateChannel.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.currentServer) return;
  const type = document.querySelector('input[name="channelType"]:checked')?.value || 'text';
  const name = dom.inputChannelName.value.trim();
  if (!name) return;

  state.socket.emit('channel:create', {
    serverId: state.currentServer.id,
    categoryId: targetCategoryIdForChannel,
    channelName: name,
    type
  });
  dom.modalCreateChannel.classList.add('hidden');
});

// Channel prefix toggle (# vs 🔊)
document.querySelectorAll('input[name="channelType"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    document.querySelectorAll('.channel-radio-card').forEach(c => c.classList.remove('active'));
    radio.closest('.channel-radio-card').classList.add('active');
    dom.channelNamePrefix.textContent = e.target.value === 'voice' ? '🔊' : '#';
  });
});

// Server Dropdown
dom.sidebarHeader.addEventListener('click', (e) => {
  if (!state.currentServer) return;
  dom.serverDropdownMenu.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!dom.sidebarHeader.contains(e.target)) {
    dom.serverDropdownMenu.classList.add('hidden');
  }
});
dom.menuCreateChannel.addEventListener('click', () => {
  dom.serverDropdownMenu.classList.add('hidden');
  if (state.currentServer && state.currentServer.categories.length > 0) {
    openCreateChannelModal(state.currentServer.categories[0].id);
  }
});
dom.menuInvite.addEventListener('click', () => {
  dom.serverDropdownMenu.classList.add('hidden');
  if (state.currentServer) {
    navigator.clipboard.writeText(state.currentServer.inviteCode || state.currentServer.id);
    alert(`✨ Davet kodu panoya kopyalandı: ${state.currentServer.inviteCode}`);
  }
});

// =============================================================================
// PHOTO UPLOADS SETUP (SERVER ICON, PROFILE AVATAR, PROFILE BANNER)
// =============================================================================
function setupPhotoUploads() {
  // 1. Server icon upload in Create Server Modal
  if (dom.btnUploadServerIcon && dom.inputServerIconFile) {
    dom.btnUploadServerIcon.addEventListener('click', () => dom.inputServerIconFile.click());
    dom.inputServerIconFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        selectedServerIcon = ev.target.result;
        if (dom.serverIconImgPreview && dom.serverIconEmojiPreview) {
          dom.serverIconImgPreview.src = selectedServerIcon;
          dom.serverIconImgPreview.classList.remove('hidden');
          dom.serverIconEmojiPreview.classList.add('hidden');
        }
        document.querySelectorAll('.icon-preset-btn').forEach(b => b.classList.remove('active'));
      };
      reader.readAsDataURL(file);
    });
  }

  // 2. Server icon change for existing server from dropdown
  if (dom.menuChangeServerIcon && dom.inputEditServerIconFile) {
    dom.menuChangeServerIcon.addEventListener('click', () => {
      dom.serverDropdownMenu.classList.add('hidden');
      if (state.currentServer) {
        dom.inputEditServerIconFile.click();
      }
    });

    dom.inputEditServerIconFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !state.currentServer) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        state.socket.emit('server:update-icon', {
          serverId: state.currentServer.id,
          icon: dataUrl
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // 3. User Avatar photo upload in Settings
  if (dom.btnUploadAvatar && dom.inputAvatarFile) {
    dom.btnUploadAvatar.addEventListener('click', () => dom.inputAvatarFile.click());
    dom.inputAvatarFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        if (state.currentUser) {
          state.currentUser.avatar = dataUrl;
          updateSelfProfileUI();
          state.socket.emit('user:update-profile', { avatar: dataUrl });
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // 4. User Banner photo upload in Settings
  if (dom.btnUploadBanner && dom.inputBannerFile) {
    dom.btnUploadBanner.addEventListener('click', () => dom.inputBannerFile.click());
    dom.inputBannerFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const bannerVal = `url("${dataUrl}") center/cover no-repeat`;
        if (state.currentUser) {
          state.currentUser.bannerColor = bannerVal;
          updateSelfProfileUI();
          state.socket.emit('user:update-profile', { bannerColor: bannerVal });
        }
      };
      reader.readAsDataURL(file);
    });
  }
}

// =============================================================================
// 11. GENERAL CONTROLS SETUP
// =============================================================================
function setupEventListeners() {
  dom.btnHome.addEventListener('click', renderHomeView);

  dom.btnToggleMic.addEventListener('click', toggleMute);
  dom.btnToggleDeafen.addEventListener('click', toggleDeafen);
  dom.btnOpenSettings.addEventListener('click', openUserSettingsModal);
  dom.btnSelfProfile.addEventListener('click', openUserSettingsModal);

  dom.btnDisconnectVoice.addEventListener('click', () => leaveVoiceChannel(true));
  dom.dockBtnCamera.addEventListener('click', toggleCamera);
  dom.dockBtnScreen.addEventListener('click', toggleScreenShare);

  dom.stageBtnMic.addEventListener('click', toggleMute);
  dom.stageBtnCam.addEventListener('click', toggleCamera);
  dom.stageBtnScreen.addEventListener('click', toggleScreenShare);
  dom.stageBtnLeave.addEventListener('click', () => leaveVoiceChannel(true));

  dom.btnToggleMembers.addEventListener('click', () => {
    dom.sidebarMembers.classList.toggle('hidden');
    dom.btnToggleMembers.classList.toggle('active');
  });

  dom.btnFullscreenStage.addEventListener('click', () => {
    if (!document.fullscreenElement) dom.voiceStage.requestFullscreen();
    else document.exitFullscreen();
  });
}

// Start
window.addEventListener('DOMContentLoaded', () => {
  setupAuthForms();
  initSocket();
  setupEventListeners();
  setupPhotoUploads();
  initEmojiPicker();
});
