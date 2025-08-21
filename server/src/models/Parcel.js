import mongoose from 'mongoose';

export const PARCEL_STATUSES = [
	'Pending',
	'Assigned',
	'Picked Up',
	'In Transit',
	'Delivered',
	'Failed'
];

const locationSchema = new mongoose.Schema(
	{
		lat: { type: Number },
		lng: { type: Number },
		updatedAt: { type: Date }
	},
	{ _id: false }
);

const parcelSchema = new mongoose.Schema(
	{
		trackingCode: { type: String, index: true, unique: true },
		customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		pickupAddress: { type: String, required: true },
		deliveryAddress: { type: String, required: true },
		parcelSize: { type: String, enum: ['Small', 'Medium', 'Large'], required: true },
		parcelType: { type: String, enum: ['Document', 'Fragile', 'Standard', 'Perishable'], required: true },
		paymentType: { type: String, enum: ['COD', 'Prepaid'], required: true },
		codAmount: { type: Number, default: 0 },
		status: { type: String, enum: PARCEL_STATUSES, default: 'Pending', index: true },
		currentLocation: { type: locationSchema, default: () => ({}) },
		etaMinutes: { type: Number },
		notes: { type: String }
	},
	{ timestamps: true }
);

export const Parcel = mongoose.model('Parcel', parcelSchema);
