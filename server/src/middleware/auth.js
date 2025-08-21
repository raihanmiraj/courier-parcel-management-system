import { verifyJwt } from '../utils/jwt.js';
import { User } from '../models/User.js';

export async function requireAuth(req, res, next) {
	try {
		const authHeader = req.headers.authorization || '';
		const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
		if (!token) return res.status(401).json({ message: 'Unauthorized' });
		const decoded = verifyJwt(token);
		const user = await User.findById(decoded.id);
		if (!user || !user.isActive) return res.status(401).json({ message: 'Unauthorized' });
		req.user = { id: user.id, role: user.role, name: user.name };
		next();
	} catch (err) {
		return res.status(401).json({ message: 'Unauthorized' });
	}
}

export function requireRoles(...roles) {
	return function (req, res, next) {
		if (!req.user || !roles.includes(req.user.role)) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		next();
	};
}
