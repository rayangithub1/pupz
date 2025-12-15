let socket;
let username = '';
let localStream, peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let offlineTimeout = null;

// Get username and mode from storage and query
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');
username = localStorage.getItem('username') || '';

if (!username || !mode) {
    alert('Please enter your name and choose a chat mode. Redirecting...');
    window.location.href = 'index.html';
}

// Initialize socket and chat
socket = io();
socket.emit('setName', username);
initializeChatHandlers();

if (mode === 'video') {
    startVideoMode();
}

async function startVideoMode() {
    const videoContainer = document.getElementById('videoContainer');
    if (videoContainer) videoContainer.style.display = 'block';

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;

        // Wait for partnerFound before creating peerConnection and offer
    } catch (err) {
        alert("Could not access camera or mic.");
        console.error(err);
    }
}



function initializeChatHandlers() {
    socket.removeAllListeners();
    const videoChatButton = document.getElementById('videoChatButton');
    if (videoChatButton) {
        videoChatButton.addEventListener('click', async () => {
            document.getElementById('videoContainer').style.display = 'block';
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('localVideo').srcObject = localStream;

            peerConnection = new RTCPeerConnection(config);

            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.ontrack = (event) => {
                document.getElementById('remoteVideo').srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('iceCandidate', event.candidate);
                }
            };

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('videoOffer', offer);
        });
    }

    socket.on('partnerFound', async () => {

  // ✅ Cancel offline auto-disconnect
  if (offlineTimeout) {
    clearTimeout(offlineTimeout);
    offlineTimeout = null;
  }

  appendMessage('You are now connected with a partner!', 'system');

  document.getElementById('sendButton').disabled = false;
  document.querySelector('.chat-actions').classList.remove('hidden');

  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    document.getElementById('remoteVideo').srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('iceCandidate', event.candidate);
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('videoOffer', offer);
});

    
    socket.on('videoOffer', async (offer) => {
        document.getElementById('videoContainer').style.display = 'block';
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;

        peerConnection = new RTCPeerConnection(config);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('iceCandidate', event.candidate);
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('videoAnswer', answer);
    });

    socket.on('videoAnswer', async (answer) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('iceCandidate', async (candidate) => {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    document.getElementById('requestPhotoButton').addEventListener('click', () => {
        socket.emit('requestPhoto');
        appendMessage('You requested a photo from your partner', 'system');
    });

    socket.on('photoRequest', () => {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'system-message');

        const text = document.createTextNode('Your partner requested a photo: ');
        const link = document.createElement('span');
        link.textContent = 'Click here to send';
        link.style.color = '#a30000';
        link.style.cursor = 'pointer';
        link.style.textDecoration = 'underline';
        link.onclick = () => document.getElementById('hiddenFileInput').click();

        messageDiv.appendChild(text);
        messageDiv.appendChild(link);
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    document.getElementById('hiddenFileInput').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (event) {
                socket.emit('sendImage', event.target.result);
                appendImage(event.target.result, 'user');
            };
            reader.readAsDataURL(file);
        }
    });

    socket.on('receiveImage', (imageData) => {
        appendImage(imageData, 'partner');
    });

    socket.on('waiting', () => {
  appendMessage(
    'Keep the Chat Clean and do not share absurd pictures. Waiting for a partner...',
    'system'
  )

  document.getElementById('sendButton').disabled = true
  document.querySelector('.chat-actions').classList.add('hidden')
})



    socket.on('message', ({ text, name }) => {
        appendMessage(text, 'partner', name);
    });

   socket.on('partnerDisconnected', () => {
  appendMessage('Your partner has disconnected.', 'system');

  // Disable chat UI
  document.getElementById('sendButton').disabled = true;
  document.querySelector('.chat-actions').classList.add('hidden');

  // Cancel offline auto-disconnect timer if running
  if (offlineTimeout) {
    clearTimeout(offlineTimeout);
    offlineTimeout = null;
  }

  // Reset disconnect button → START
  const disconnectButton = document.getElementById('disconnectButton');
  disconnectButton.textContent = 'Start';
  disconnectButton.classList.remove('confirm');
  disconnectButton.classList.add('start');
  disconnectState = 'start';

  // Close peer connection safely
  if (peerConnection) {
    peerConnection.getSenders().forEach(sender => {
      if (sender.track) sender.track.stop();
    });
    peerConnection.close();
    peerConnection = null;
  }

  // Clear remote video
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
});




    document.getElementById('sendButton').addEventListener('click', () => {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        if (message) {
            appendMessage(message, 'user');
            socket.emit('sendMessage', { text: message, name: username });
            messageInput.value = '';
        }
    });

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    messageInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendButton.click();
        }
    });

    let disconnectState = 'disconnect';

    const disconnectButton = document.getElementById('disconnectButton');
    disconnectButton.addEventListener('click', () => {
  switch (disconnectState) {

    case 'disconnect':
      disconnectButton.textContent = 'Confirm?'
      disconnectButton.classList.add('confirm')
      disconnectButton.classList.remove('start')
      disconnectState = 'confirm'
      break

    case 'confirm':
      socket.emit('disconnectPartner')
      appendMessage('You have disconnected from your partner.', 'system')

      disconnectButton.textContent = 'Start'
      disconnectButton.classList.remove('confirm')
      disconnectButton.classList.add('start')

      document.getElementById('sendButton').disabled = true
      disconnectState = 'start'
      break

    case 'start':
      socket.emit('startLooking')
      appendMessage('Searching for a new partner...', 'system')

      disconnectButton.textContent = 'Disconnect'
      disconnectButton.classList.remove('start', 'confirm')

      disconnectState = 'disconnect'
      break
  }
})


    const style = document.createElement('style');
    style.textContent = `
        .system-message {
            text-align: center;
            color: red;
            font-weight: bold;
            margin: 10px 0;
        }
        .system-message span:hover {
            color: #ff0000;
            text-decoration: underline;
        }
    `;
    document.head.appendChild(style);
}

function appendMessage(message, type, name = '') {
  const messagesDiv = document.getElementById('messages')

  // SYSTEM MESSAGE
  if (type === 'system') {
    const sys = document.createElement('div')
    sys.className = 'message-box-holder'
    sys.innerHTML = `
      <div class="message-box" style="background:#ffe5e5;border-color:#ffb3b3;">
        ${message}
      </div>
    `
    messagesDiv.appendChild(sys)
    messagesDiv.scrollTop = messagesDiv.scrollHeight
    return
  }

  // USER MESSAGE
  if (type === 'user') {
    const holder = document.createElement('div')
    holder.className = 'message-box-holder'
    holder.innerHTML = `
      <div class="message-box">${message}</div>
    `
    messagesDiv.appendChild(holder)
  }

  // PARTNER MESSAGE
  if (type === 'partner') {
    const holder = document.createElement('div')
    holder.className = 'message-box-holder'
    holder.innerHTML = `
      <div class="message-sender">${name || 'Stranger'}</div>
      <div class="message-box message-partner">${message}</div>
    `
    messagesDiv.appendChild(holder)
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}


function appendImage(imageData, type) {
  const messagesDiv = document.getElementById('messages')
  const holder = document.createElement('div')
  holder.className = 'message-box-holder'

  if (type === 'user') {
    holder.innerHTML = `
      <div class="message-box">
        <img src="${imageData}" style="max-width:200px;border-radius:8px;">
      </div>
    `
  } else {
    holder.innerHTML = `
      <div class="message-sender">Stranger</div>
      <div class="message-box message-partner">
        <img src="${imageData}" style="max-width:200px;border-radius:8px;">
      </div>
    `
  }

  messagesDiv.appendChild(holder)
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}


const min = 4000;
  const max = 4500;
  const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
  document.getElementById('randomNumber').textContent = `+${randomValue}`;










