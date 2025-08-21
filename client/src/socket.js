import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Create a default socket instance for general use
export const socket = io(SOCKET_URL);

// Export the createSocket function for creating user-specific sockets
export function createSocket(userId) {
	return io(SOCKET_URL, { query: { userId } });
}
