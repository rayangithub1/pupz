let socket;
let username = '';
let localStream = null;
let peerConnection = null;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let disconnectState = 'disconnect';

// Get username and mode
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');
username = localStorage.getItem('username') || '';

if (!username || !mode) {
    alert('Please enter your name and choose a chat mode. Redirecting...');
    window.location.href = 'index.html';
}

// Initialize socket
socket = io();
socket.emit('setName', username);

// Request media once
async function getLocalStream() {
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            alert("Could not access camera or mic.");
            console.error(err);
        }
    }
}

// Initialize chat handlers
function initializeChatHandlers() {
    // Video chat button
    const videoChatButton = document.getElementById('videoChatButton');
    if (videoChatButton) {
        videoChatButton.addEventListener('click', async () => {
            document.getElementById('videoContainer').style.display = 'block';
            await getLocalStream();
            startPeerConnection(true); // initiator
        });
    }

    // Partner found
    socket.on('partnerFound', async () => {
        appendMessage('You are now connected with a partner!', 'system');
        document.getElementById('sendButton').disabled = false;
        document.querySelector('.chat-actions').classList.remove('hidden');
        await getLocalStream();
        startPeerConnection(true); // initiator
    });

    // Video offer received
    socket.on('videoOffer', async (offer) => {
        document.getElementById('videoContainer').style.display = 'block';
        await getLocalStream();
        startPeerConnection(false); // receiver
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('videoAnswer', answer);
    });

    // Video answer received
    socket.on('videoAnswer', async (answer) => {
        if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // ICE candidate received
    socket.on('iceCandidate', async (candidate) => {
        if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    // Message received
    socket.on('message', ({ text, name }) => appendMessage(text, 'partner', name));

    // Partner disconnected
    socket.on('partnerDisconnected', () => handlePartnerDisconnect());

    // Waiting state
    socket.on('waiting', () => {
        appendMessage('Keep the Chat Clean and do not share absurd pictures. Waiting for a partner...', 'system');
        document.getElementById('sendButton').disabled = true;
        document.querySelector('.chat-actions').classList.add('hidden');
    });

    // Image request
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

    // Handle image sending
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

    socket.on('receiveImage', (imageData) => appendImage(imageData, 'partner'));

    // Send text message
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    sendButton.addEventListener('click', () => {
        const message = messageInput.value.trim();
        if (message) {
            appendMessage(message, 'user');
            socket.emit('sendMessage', { text: message, name: username });
            messageInput.value = '';
        }
    });

    messageInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendButton.click();
        }
    });

    // Disconnect/start button
    const disconnectButton = document.getElementById('disconnectButton');
    disconnectButton.addEventListener('click', () => handleDisconnectButton());

    // Handle tab close
    window.addEventListener('beforeunload', () => {
        socket.emit('disconnectPartner');
        if (peerConnection) peerConnection.close();
    });

    // Add system message styling
    const style = document.createElement('style');
    style.textContent = `
        .system-message { text-align:center; color:red; font-weight:bold; margin:10px 0; }
        .system-message span:hover { color:#ff0000; text-decoration:underline; }
    `;
    document.head.appendChild(style);
}

// Start or receive a peer connection
async function startPeerConnection(isInitiator) {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(config);

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) remoteVideo.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) socket.emit('iceCandidate', event.candidate);
        };

        if (isInitiator) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('videoOffer', offer);
        }
    }
}

// Handle partner disconnect
function handlePartnerDisconnect() {
    appendMessage('Your partner has disconnected.', 'system');
    document.getElementById('sendButton').disabled = true;
    document.querySelector('.chat-actions').classList.add('hidden');
    disconnectState = 'start';
    const disconnectButton = document.getElementById('disconnectButton');
    disconnectButton.textContent = 'Start';
    disconnectButton.classList.remove('confirm');
    disconnectButton.classList.add('start');
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = null;
}

// Handle disconnect/start button logic
function handleDisconnectButton() {
    const disconnectButton = document.getElementById('disconnectButton');
    switch (disconnectState) {
        case 'disconnect':
            disconnectButton.textContent = 'Confirm?';
            disconnectButton.classList.add('confirm');
            disconnectButton.classList.remove('start');
            disconnectState = 'confirm';
            break;
        case 'confirm':
            socket.emit('disconnectPartner');
            appendMessage('You have disconnected from your partner.', 'system');
            disconnectButton.textContent = 'Start';
            disconnectButton.classList.remove('confirm');
            disconnectButton.classList.add('start');
            document.getElementById('sendButton').disabled = true;
            disconnectState = 'start';
            if (peerConnection) peerConnection.close();
            peerConnection = null;
            break;
        case 'start':
            socket.emit('startLooking');
            appendMessage('Searching for a new partner...', 'system');
            disconnectButton.textContent = 'Disconnect';
            disconnectButton.classList.remove('start', 'confirm');
            disconnectState = 'disconnect';
            break;
    }
}

// Message append helpers
function appendMessage(message, type, name = '') {
    const messagesDiv = document.getElementById('messages');
    const holder = document.createElement('div');
    holder.className = 'message-box-holder';
    if (type === 'system') {
        holder.innerHTML = `<div class="message-box" style="background:#ffe5e5;border-color:#ffb3b3;">${message}</div>`;
    } else if (type === 'user') {
        holder.innerHTML = `<div class="message-box">${message}</div>`;
    } else {
        holder.innerHTML = `<div class="message-sender">${name || 'Stranger'}</div><div class="message-box message-partner">${message}</div>`;
    }
    messagesDiv.appendChild(holder);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendImage(imageData, type) {
    const messagesDiv = document.getElementById('messages');
    const holder = document.createElement('div');
    holder.className = 'message-box-holder';
    if (type === 'user') {
        holder.innerHTML = `<div class="message-box"><img src="${imageData}" style="max-width:200px;border-radius:8px;"></div>`;
    } else {
        holder.innerHTML = `<div class="message-sender">Stranger</div><div class="message-box message-partner"><img src="${imageData}" style="max-width:200px;border-radius:8px;"></div>`;
    }
    messagesDiv.appendChild(holder);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Initialize handlers
initializeChatHandlers();

// Start video if mode is video
if (mode === 'video') getLocalStream();

// Random number display
const min = 4000, max = 4500;
const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
const randomNumberEl = document.getElementById('randomNumber');
if (randomNumberEl) randomNumberEl.textContent = `+${randomValue}`;
