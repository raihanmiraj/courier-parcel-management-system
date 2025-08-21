import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as parcelController from '../controllers/parcel.controller.js';

const router = express.Router();

// Public tracking route (no auth required)
router.get('/track/:trackingCode', parcelController.getParcelByTrackingCode);

router.use(requireAuth);

router.get('/', parcelController.listParcels);
router.post('/', parcelController.createParcel);
router.get('/:id', parcelController.getParcel);
router.post('/:id/assign', parcelController.assignAgent);
router.post('/:id/status', parcelController.updateStatus);
router.post('/:id/location', parcelController.updateLocation);
router.delete('/:id', parcelController.deleteParcel);

export default router;
