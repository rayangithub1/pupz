let socket;
let username = '';
let localStream, peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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
    } catch (err) {
        alert("Could not access camera or mic.");
        console.error(err);
    }
}


function initializeChatHandlers() {
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
        appendMessage('Keep the Chat Clean and do not share absurd pictures. Waiting for a partner...', 'system');
        document.getElementById('sendButton').disabled = true;
    });

    socket.on('partnerFound', () => {
        appendMessage('You are now connected with a partner!', 'system');
        document.getElementById('sendButton').disabled = false;
    });

    socket.on('message', ({ text, name }) => {
        appendMessage(text, 'partner', name);
    });

    socket.on('partnerDisconnected', () => {
        appendMessage('Your partner has disconnected.', 'system');
        document.getElementById('sendButton').disabled = true;
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
                disconnectButton.textContent = 'Confirm?';
                disconnectButton.classList.remove('btn-outline-primary');
                disconnectButton.classList.add('btn-outline-danger');
                disconnectState = 'confirm';
                break;

            case 'confirm':
                socket.emit('disconnectPartner');
                appendMessage('You have disconnected from your partner.', 'system');
                disconnectButton.textContent = 'Start';
                disconnectButton.classList.remove('btn-outline-danger');
                disconnectButton.classList.add('btn-outline-success');
                disconnectState = 'start';
                document.getElementById('sendButton').disabled = true;
                break;

            case 'start':
                socket.emit('startLooking');
                appendMessage('Searching for a new partner...', 'system');
                disconnectButton.textContent = 'Disconnect';
                disconnectButton.classList.remove('btn-outline-success');
                disconnectButton.classList.add('btn-outline-primary');
                disconnectState = 'disconnect';
                break;
        }
    });

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
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');

    const nameSpan = document.createElement('span');
    nameSpan.style.fontWeight = 'bold';
    nameSpan.style.marginRight = '5px';

    if (type === 'user') {
        nameSpan.textContent = `${username}(You):`;
        nameSpan.style.color = 'blue';
    } else if (type === 'partner') {
        nameSpan.textContent = `${name}(Stranger):`;
        nameSpan.style.color = 'red';
    } else if (type === 'system') {
        const existingSystemMessages = messagesDiv.querySelectorAll('.system-message');
        existingSystemMessages.forEach(msg => msg.remove());

        messageDiv.classList.add('system-message');
        messageDiv.textContent = message;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return;
    }

    const messageText = document.createElement('span');
    messageText.textContent = ` ${message}`;

    messageDiv.appendChild(nameSpan);
    messageDiv.appendChild(messageText);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendImage(imageData, type) {
    const messagesDiv = document.getElementById('messages');
    const container = document.createElement('div');
    container.classList.add('message', type === 'user' ? 'user-message' : 'partner-message');

    const img = document.createElement('img');
    img.src = imageData;
    img.style.maxWidth = '200px';
    img.style.borderRadius = '10px';
    img.style.margin = '5px 0';

    container.appendChild(img);
    messagesDiv.appendChild(container);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

const min = 4000;
  const max = 4500;
  const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
  document.getElementById('randomNumber').textContent = `+${randomValue}`;