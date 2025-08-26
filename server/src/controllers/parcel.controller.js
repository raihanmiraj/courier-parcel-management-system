import { Parcel, PARCEL_STATUSES } from '../models/Parcel.js';
import { User } from '../models/User.js';
import { io } from '../index.js';
import { v4 as uuidv4 } from 'uuid';
import { sendStatusEmail } from '../utils/mailer.js';

export async function createParcel(req, res) {
	try {
		const {
			pickupAddress,
			deliveryAddress,
			parcelSize,
			parcelType,
			paymentType,
			codAmount,
			notes
		} = req.body;

		const trackingCode = uuidv4().split('-')[0].toUpperCase();
		const parcel = await Parcel.create({
			trackingCode,
			customer: req.user.id,
			pickupAddress,
			deliveryAddress,
			parcelSize,
			parcelType,
			paymentType,
			codAmount: paymentType === 'COD' ? codAmount || 0 : 0,
			notes
		});
		res.status(201).json(parcel);
	} catch (err) {
		res.status(500).json({ message: 'Create parcel failed' });
	}
}

export async function listParcels(req, res) {
	try {
		const role = req.user.role;
		const userId = req.user.id;
		const filter = {};
		if (role === 'customer') filter.customer = userId;
		if (role === 'agent') filter.agent = userId;
		const parcels = await Parcel.find(filter)
			.sort({ createdAt: -1 })
			.populate('customer', 'name email')
			.populate('agent', 'name email');
		res.json(parcels);
	} catch (err) {
		res.status(500).json({ message: 'Fetch parcels failed' });
	}
}

export async function getParcel(req, res) {
	try {
		const parcel = await Parcel.findById(req.params.id).populate('customer', 'name email').populate('agent', 'name email');
		if (!parcel) return res.status(404).json({ message: 'Not found' });
		res.json(parcel);
	} catch (err) {
		res.status(500).json({ message: 'Fetch parcel failed' });
	}
}

export async function getParcelByTrackingCode(req, res) {
	try {
		const { trackingCode } = req.params;
		const parcel = await Parcel.findOne({ trackingCode }).populate('customer', 'name email').populate('agent', 'name email');
		if (!parcel) return res.status(404).json({ message: 'Parcel not found' });
		res.json(parcel);
	} catch (err) {
		res.status(500).json({ message: 'Fetch parcel failed' });
	}
}

export async function assignAgent(req, res) {
	try {
		const { agentId } = req.body;
		const parcel = await Parcel.findById(req.params.id);
		if (!parcel) return res.status(404).json({ message: 'Not found' });
		const agent = await User.findById(agentId);
		if (!agent || agent.role !== 'agent') return res.status(400).json({ message: 'Invalid agent' });
		parcel.agent = agentId;
		parcel.status = 'Assigned';
		await parcel.save();
		const populated = await Parcel.findById(parcel.id).populate('customer', 'name email').populate('agent', 'name email');
		io.to(`parcel:${parcel.id}`).emit('parcel:update', { id: parcel.id, status: parcel.status, agent: populated.agent });
		res.json(populated);
	} catch (err) {
		res.status(500).json({ message: 'Assignment failed' });
	}
}

export async function updateStatus(req, res) {
	try {
		const { status } = req.body;
		if (!PARCEL_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
		const parcel = await Parcel.findById(req.params.id).populate('customer', 'name email');
		if (!parcel) return res.status(404).json({ message: 'Not found' });
		// Agent or Admin can update; Customer cannot.
		if (!['admin', 'agent'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
		// Agent can only update if assigned
		if (req.user.role === 'agent' && String(parcel.agent) !== String(req.user.id)) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		parcel.status = status;
		await parcel.save();
		io.to(`parcel:${parcel.id}`).emit('parcel:update', { id: parcel.id, status: parcel.status });
		// Best-effort email to customer
		try {
			const to = parcel?.customer?.email;
			if (to) {
				await sendStatusEmail({ to, parcel, newStatus: status });
			}
		} catch (_) {}
		res.json(parcel);
	} catch (err) {
		res.status(500).json({ message: 'Update status failed' });
	}
}

export async function updateLocation(req, res) {
	try {
		const { lat, lng, etaMinutes } = req.body;
		const parcel = await Parcel.findById(req.params.id);
		if (!parcel) return res.status(404).json({ message: 'Not found' });
		if (req.user.role !== 'agent' || String(parcel.agent) !== String(req.user.id)) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		parcel.currentLocation = { lat, lng, updatedAt: new Date() };
		if (etaMinutes != null) parcel.etaMinutes = etaMinutes;
		await parcel.save();
		io.to(`parcel:${parcel.id}`).emit('parcel:location', {
			id: parcel.id,
			trackingCode: parcel.trackingCode,
			currentLocation: parcel.currentLocation,
			etaMinutes: parcel.etaMinutes
		});
		res.json(parcel);
	} catch (err) {
		res.status(500).json({ message: 'Update location failed' });
	}
}

export async function deleteParcel(req, res) {
	try {
		const parcel = await Parcel.findByIdAndDelete(req.params.id);
		if (!parcel) return res.status(404).json({ message: 'Not found' });
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ message: 'Delete parcel failed' });
	}
}
