// server.js
const express = require('express');
const socketio = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

let waitingUsers = [];
const activePairs = new Map();

app.use(express.static('public'));

// Helper to get a user's partner socket
function getPartnerSocket(id) {
    const pair = activePairs.get(id);
    if (pair) {
        const partnerId = pair.find(pid => pid !== id);
        return io.sockets.sockets.get(partnerId);
    }
    return null;
}

// Function to pair users
function tryToPair() {
    while (waitingUsers.length >= 2) {
        const user1Id = waitingUsers.shift();
        const user2Id = waitingUsers.shift();

        const socket1 = io.sockets.sockets.get(user1Id);
        const socket2 = io.sockets.sockets.get(user2Id);

        if (socket1 && socket2) {
            socket1.partner = socket2;
            socket2.partner = socket1;

            activePairs.set(user1Id, [user1Id, user2Id]);
            activePairs.set(user2Id, [user1Id, user2Id]);

            socket1.emit('partnerFound');
            socket2.emit('partnerFound');
        } else {
            if (socket1) waitingUsers.push(user1Id);
            if (socket2) waitingUsers.push(user2Id);
        }
    }
}

io.on('connection', (socket) => {
    console.log('New user connected: ' + socket.id);

    waitingUsers.push(socket.id);
    socket.emit('waiting');
    tryToPair();

    socket.on('sendMessage', ({ text, name }) => {
        if (typeof text !== 'string') return;
        const trimmed = text.trim();
        if (!trimmed) return;

        if (socket.partner) {
            socket.partner.emit('message', { text: trimmed, name: name || 'Partner' });
        } else {
            socket.emit('messageError', 'You must be connected to a partner to send messages.');
        }
    });

    socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Remove from waiting queue if present
    waitingUsers = waitingUsers.filter(id => id !== socket.id);

    // If user had a partner, notify them
    if (socket.partner) {
        socket.partner.emit('partnerOffline');

        // Remove pairing from activePairs
        activePairs.delete(socket.id);
        activePairs.delete(socket.partner.id);

        // Remove partner reference
        delete socket.partner.partner;

        // Put partner back into waiting pool
        if (!waitingUsers.includes(socket.partner.id)) {
            waitingUsers.push(socket.partner.id);
            socket.partner.emit('waiting');
        }
    }
});


    socket.on('skip', () => {
        if (socket.partner) {
            socket.partner.emit('partnerDisconnected');
            delete socket.partner.partner;

            if (!waitingUsers.includes(socket.partner.id)) {
                waitingUsers.push(socket.partner.id);
                socket.partner.emit('waiting');
            }
        }

        delete socket.partner;

        if (!waitingUsers.includes(socket.id)) {
            waitingUsers.push(socket.id);
            socket.emit('waiting');
        }

        tryToPair();
    });

    socket.on('requestPhoto', () => {
        if (socket.partner) {
            socket.partner.emit('photoRequest');
        }
    });

    socket.on('sendImage', (imageData) => {
        if (socket.partner) {
            socket.partner.emit('receiveImage', imageData);
        }
    });

    // WebRTC signaling events
    socket.on('videoOffer', offer => {
        const partner = getPartnerSocket(socket.id);
        if (partner) partner.emit('videoOffer', offer);
    });

    socket.on('videoAnswer', answer => {
        const partner = getPartnerSocket(socket.id);
        if (partner) partner.emit('videoAnswer', answer);
    });

    socket.on('iceCandidate', candidate => {
        const partner = getPartnerSocket(socket.id);
        if (partner) partner.emit('iceCandidate', candidate);
    });

    socket.on('disconnectPartner', () => {
    if (socket.partner) {
        socket.partner.emit('partnerDisconnected');

        // Remove partner's reference to this socket
        delete socket.partner.partner;

        // Push partner back to queue
        if (!waitingUsers.includes(socket.partner.id)) {
            waitingUsers.push(socket.partner.id);
            socket.partner.emit('waiting');
        }

        // Clean up current socket's partner reference
        delete socket.partner;
    }

    // Remove current user from any active pairing
    activePairs.delete(socket.id);

    // Don't add current user to waiting list just yet
});

socket.on('startLooking', () => {
    if (!waitingUsers.includes(socket.id)) {
        waitingUsers.push(socket.id);
        socket.emit('waiting');
        tryToPair();
    }
});


});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));


