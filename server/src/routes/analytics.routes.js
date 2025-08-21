import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { dashboardMetrics, exportCsv, exportPdf } from '../controllers/analytics.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/dashboard', requireRoles('admin'), dashboardMetrics);
router.get('/export/csv', requireRoles('admin'), exportCsv);
router.get('/export/pdf', requireRoles('admin'), exportPdf);

export default router;
