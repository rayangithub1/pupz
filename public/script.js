let socket = io();
let localStream = null;
let peerConnection = null;
let disconnectState = 'disconnect';
let offlineTimeout = null;

const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

/* =======================
   INIT
======================= */
initializeSocketHandlers();
initializeUIHandlers();

/* =======================
   SOCKET HANDLERS
======================= */
function initializeSocketHandlers() {
  socket.removeAllListeners();

  socket.on('waiting', () => {
    systemMessage('Waiting for a partner...');
    disableChat();
  });

  socket.on('partnerFound', async () => {
    clearOfflineTimer();
    systemMessage('You are now connected with a partner!');
    enableChat();
    await startMedia();
    createPeer(true);
  });

  socket.on('partnerDisconnected', () => {
    systemMessage('Your partner has disconnected.');
    resetDisconnectButton();
    disableChat();
    cleanupConnection();

    offlineTimeout = setTimeout(cleanupConnection, 10000);
  });

  socket.on('message', ({ text, name }) => {
    appendMessage(text, 'partner', name || 'Stranger');
  });

  socket.on('receiveImage', img => {
    appendImage(img, 'partner');
  });

  socket.on('videoOffer', async offer => {
    await startMedia();
    createPeer(false);
    await peerConnection.setRemoteDescription(offer);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('videoAnswer', answer);
  });

  socket.on('videoAnswer', answer => {
    peerConnection?.setRemoteDescription(answer);
  });

  socket.on('iceCandidate', candidate => {
    peerConnection?.addIceCandidate(candidate);
  });
}

/* =======================
   WEBRTC
======================= */
async function startMedia() {
  if (localStream) return;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  document.getElementById('localVideo').srcObject = localStream;
}

function createPeer(isOfferer) {
  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = e => {
    document.getElementById('remoteVideo').srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit('iceCandidate', e.candidate);
  };

  if (isOfferer) {
    peerConnection.createOffer().then(offer => {
      peerConnection.setLocalDescription(offer);
      socket.emit('videoOffer', offer);
    });
  }
}

/* =======================
   UI HANDLERS
======================= */
function initializeUIHandlers() {
  document.getElementById('sendButton').onclick = () => {
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (!msg) return;

    appendMessage(msg, 'user');
    socket.emit('sendMessage', { text: msg });
    input.value = '';
  };

  document.getElementById('disconnectButton').onclick = () => {
    const btn = document.getElementById('disconnectButton');

    if (disconnectState === 'disconnect') {
      btn.textContent = 'Confirm?';
      btn.classList.add('confirm');
      disconnectState = 'confirm';
      return;
    }

    if (disconnectState === 'confirm') {
      socket.emit('disconnectPartner');
      systemMessage('You disconnected from your partner.');
      resetDisconnectButton();
      disableChat();
      cleanupConnection();
      return;
    }

    if (disconnectState === 'start') {
      socket.emit('startLooking');
      systemMessage('Searching for a new partner...');
      btn.textContent = 'Disconnect';
      btn.classList.remove('start');
      disconnectState = 'disconnect';
    }
  };

  document.getElementById('hiddenFileInput').onchange = e => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('sendImage', reader.result);
      appendImage(reader.result, 'user');
    };
    reader.readAsDataURL(file);
  };

  window.addEventListener('beforeunload', () => {
    socket.emit('disconnectPartner');
  });
}

/* =======================
   HELPERS
======================= */
function cleanupConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  document.getElementById('remoteVideo').srcObject = null;
}

function resetDisconnectButton() {
  const btn = document.getElementById('disconnectButton');
  btn.textContent = 'Start';
  btn.classList.remove('confirm');
  btn.classList.add('start');
  disconnectState = 'start';
}

function clearOfflineTimer() {
  if (offlineTimeout) {
    clearTimeout(offlineTimeout);
    offlineTimeout = null;
  }
}

function enableChat() {
  document.getElementById('sendButton').disabled = false;
  document.querySelector('.chat-actions').classList.remove('hidden');
}

function disableChat() {
  document.getElementById('sendButton').disabled = true;
  document.querySelector('.chat-actions').classList.add('hidden');
}

/* =======================
   MESSAGE UI
======================= */
function systemMessage(text) {
  const box = document.createElement('div');
  box.className = 'message-box-holder';
  box.innerHTML = `<div class="message-box system">${text}</div>`;
  messages.appendChild(box);
  messages.scrollTop = messages.scrollHeight;
}

function appendMessage(text, type, name = '') {
  const box = document.createElement('div');
  box.className = 'message-box-holder';

  box.innerHTML =
    type === 'user'
      ? `<div class="message-box">${text}</div>`
      : `<div class="message-sender">${name}</div>
         <div class="message-box message-partner">${text}</div>`;

  messages.appendChild(box);
  messages.scrollTop = messages.scrollHeight;
}

function appendImage(src, type) {
  const box = document.createElement('div');
  box.className = 'message-box-holder';

  box.innerHTML = `
    ${type === 'partner' ? '<div class="message-sender">Stranger</div>' : ''}
    <div class="message-box ${type === 'partner' ? 'message-partner' : ''}">
      <img src="${src}" style="max-width:200px;border-radius:8px;">
    </div>
  `;

  messages.appendChild(box);
  messages.scrollTop = messages.scrollHeight;
}
