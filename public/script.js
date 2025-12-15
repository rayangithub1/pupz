/* ===============================
   GLOBAL STATE
================================ */
let socket = io();
let username = '';
let localStream = null;
let peerConnection = null;
let offlineTimeout = null;
let disconnectState = 'disconnect';

const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

/* ===============================
   INIT
================================ */
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');
username = localStorage.getItem('username') || '';

if (!username || !mode) {
  alert('Please enter your name and choose a chat mode.');
  window.location.href = 'index.html';
}

socket.emit('setName', username);
initializeChatHandlers();

if (mode === 'video') initMedia();

/* ===============================
   MEDIA
================================ */
async function initMedia() {
  if (localStream) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    document.getElementById('videoContainer').style.display = 'block';
    document.getElementById('localVideo').srcObject = localStream;
  } catch (err) {
    alert('Camera or microphone access denied.');
  }
}

/* ===============================
   SOCKET HANDLERS
================================ */
function initializeChatHandlers() {
  socket.removeAllListeners();

  socket.on('waiting', () => {
    appendMessage(
      'Keep the chat clean. Waiting for a partner...',
      'system'
    );
    disableChat();
  });

  socket.on('partnerFound', async () => {
    clearOfflineTimer();
    appendMessage('You are now connected with a partner!', 'system');
    enableChat();

    await initMedia();
    createPeerConnection();

    // ONLY initiator creates offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('videoOffer', offer);
  });

  socket.on('videoOffer', async offer => {
    await initMedia();
    createPeerConnection();

    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('videoAnswer', answer);
  });

  socket.on('videoAnswer', answer => {
    peerConnection?.setRemoteDescription(answer);
  });

  socket.on('iceCandidate', c => {
    peerConnection?.addIceCandidate(c);
  });

  socket.on('message', ({ text, name }) => {
    appendMessage(text, 'partner', name);
  });

  socket.on('partnerDisconnected', handlePartnerDisconnect);
}

/* ===============================
   PEER CONNECTION
================================ */
function createPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = e => {
    document.getElementById('remoteVideo').srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit('iceCandidate', e.candidate);
  };
}

/* ===============================
   DISCONNECT LOGIC
================================ */
function handlePartnerDisconnect() {
  appendMessage('Your partner went offline.', 'system');
  disableChat();
  resetDisconnectButton();

  offlineTimeout = setTimeout(() => {
    cleanupConnection();
    appendMessage('Disconnected due to inactivity.', 'system');
  }, 10000);
}

function cleanupConnection() {
  clearOfflineTimer();

  if (peerConnection) {
    peerConnection.getSenders().forEach(s => s.track?.stop());
    peerConnection.close();
    peerConnection = null;
  }

  document.getElementById('remoteVideo').srcObject = null;
}

function clearOfflineTimer() {
  if (offlineTimeout) {
    clearTimeout(offlineTimeout);
    offlineTimeout = null;
  }
}

/* ===============================
   UI CONTROLS
================================ */
const sendButton = document.getElementById('sendButton');
const messageInput = document.getElementById('messageInput');
const disconnectButton = document.getElementById('disconnectButton');

sendButton.type = disconnectButton.type = 'button';

sendButton.onclick = () => {
  const msg = messageInput.value.trim();
  if (!msg) return;

  appendMessage(msg, 'user');
  socket.emit('sendMessage', { text: msg, name: username });
  messageInput.value = '';
};

disconnectButton.onclick = () => {
  if (disconnectState === 'disconnect') {
    disconnectButton.textContent = 'Confirm?';
    disconnectState = 'confirm';
    return;
  }

  if (disconnectState === 'confirm') {
    socket.emit('disconnectPartner');
    appendMessage('You disconnected.', 'system');
    resetDisconnectButton();
    disableChat();
    disconnectState = 'start';
    return;
  }

  socket.emit('startLooking');
  appendMessage('Searching for a new partner...', 'system');
  disconnectButton.textContent = 'Disconnect';
  disconnectState = 'disconnect';
};

function resetDisconnectButton() {
  disconnectButton.textContent = 'Start';
  disconnectState = 'start';
}

function disableChat() {
  sendButton.disabled = true;
  document.querySelector('.chat-actions').classList.add('hidden');
}

function enableChat() {
  sendButton.disabled = false;
  document.querySelector('.chat-actions').classList.remove('hidden');
}

/* ===============================
   MESSAGE HELPERS
================================ */
function appendMessage(message, type, name = '') {
  const div = document.getElementById('messages');
  const holder = document.createElement('div');
  holder.className = 'message-box-holder';

  if (type === 'system') {
    holder.innerHTML = `<div class="message-box system-message">${message}</div>`;
  } else if (type === 'user') {
    holder.innerHTML = `<div class="message-box">${message}</div>`;
  } else {
    holder.innerHTML = `
      <div class="message-sender">${name || 'Stranger'}</div>
      <div class="message-box message-partner">${message}</div>`;
  }

  div.appendChild(holder);
  div.scrollTop = div.scrollHeight;
}
