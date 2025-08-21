import dotenv from 'dotenv';
import { connectToDatabase } from '../src/config/mongoose.js';
import { User } from '../src/models/User.js';

dotenv.config();

async function run() {
	await connectToDatabase();
	const ensure = async (name, email, password, role) => {
		let u = await User.findOne({ email });
		if (!u) {
			u = await User.create({ name, email, password, role });
			console.log(`Created ${role}:`, email);
		} else {
			console.log(`${role} exists:`, email);
		}
	};
	await ensure('Admin', 'admin@example.com', 'admin123', 'admin');
	await ensure('Agent One', 'agent1@example.com', 'agent123', 'agent');
	process.exit(0);
}

run();
