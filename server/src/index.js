import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { connectToDatabase } from './config/mongoose.js';
import { registerSocketHandlers } from './services/socket.js';
import authRoutes from './routes/auth.routes.js';
import parcelRoutes from './routes/parcel.routes.js';
import userRoutes from './routes/user.routes.js';
import assignmentRoutes from './routes/assignment.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import geocodeRoutes from './routes/geocode.routes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const corsOrigin = process.env.SOCKET_CORS_ORIGIN || process.env.CLIENT_ORIGIN || '*';
const io = new SocketIOServer(server, {
	cors: { origin: corsOrigin }
});

registerSocketHandlers(io);

// Middlewares
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/users', userRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/geocode', geocodeRoutes);

// Start
const PORT = process.env.PORT || 5000;

(async () => {
	try {
		await connectToDatabase();
		server.listen(PORT, () => {
			console.log(`Server running on http://localhost:${PORT}`);
		});
	} catch (err) {
		console.error('Failed to start server', err);
		process.exit(1);
	}
})();

export { io };