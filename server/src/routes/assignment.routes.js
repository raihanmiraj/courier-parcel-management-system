import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { User } from '../models/User.js';

const router = Router();

router.use(requireAuth);

router.get('/agents', requireRoles('admin'), async (_req, res) => {
	const agents = await User.find({ role: 'agent', isActive: true }).select('_id name email');
	res.json(agents);
});

export default router;
