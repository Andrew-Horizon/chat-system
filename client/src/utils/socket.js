import { io } from 'socket.io-client';

let socket = null;

export const connectSocket = (token) => {
  if (!token) return null;

  if (socket && socket.connected) {
    return socket;
  }

  socket = io('http://localhost:3000', {
    auth: {
      token
    },
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('Socket 已连接:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket 连接失败:', error.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket 已断开:', reason);
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};