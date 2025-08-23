import mongoose from 'mongoose';

export async function connectToDatabase() {
	const mongoUri = process.env.MONGODB_URI || 'ongodb://127.0.0.1:27017/courier_db';
	if (!mongoUri) {
		throw new Error('MONGODB_URI not set');
	}
	try {
		await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
		console.log('MongoDB connected');
	} catch (err) {
		console.error('MongoDB connection error', err?.reason ?? err);
		throw err;
	}
}