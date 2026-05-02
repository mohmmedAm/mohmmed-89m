import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const PORT = 3000;

  // Signaling logic
  const rooms = new Map<string, Set<string>>(); // roomID -> set of socketIDs
  const socketToRoom = new Map<string, string>(); // socketID -> roomID

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId: string) => {
      console.log(`Socket ${socket.id} joining room ${roomId}`);
      
      const room = rooms.get(roomId) || new Set();
      const usersInRoom = Array.from(room);
      
      room.add(socket.id);
      rooms.set(roomId, room);
      socketToRoom.set(socket.id, roomId);
      socket.join(roomId);

      // Send list of other users in the room to the new user
      socket.emit('all-users', usersInRoom);
    });

    socket.on('sending-signal', (payload) => {
      console.log(`Forwarding signal from ${socket.id} to ${payload.userToSignal}`);
      io.to(payload.userToSignal).emit('user-joined', {
        signal: payload.signal,
        callerId: socket.id
      });
    });

    socket.on('returning-signal', (payload) => {
      console.log(`Returning signal from ${socket.id} to ${payload.callerId}`);
      io.to(payload.callerId).emit('receiving-returned-signal', {
        signal: payload.signal,
        id: socket.id
      });
    });

    socket.on('disconnect', () => {
      const roomId = socketToRoom.get(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          room.delete(socket.id);
          if (room.size === 0) {
            rooms.delete(roomId);
          }
        }
        socket.to(roomId).emit('user-left', socket.id);
      }
      socketToRoom.delete(socket.id);
      console.log('User disconnected:', socket.id);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
