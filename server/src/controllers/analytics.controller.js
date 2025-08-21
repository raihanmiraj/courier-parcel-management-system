import { Parcel } from '../models/Parcel.js';
import { createObjectCsvWriter } from 'csv-writer';
import PDFDocument from 'pdfkit';

export async function dashboardMetrics(_req, res) {
	try {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dailyBookings = await Parcel.countDocuments({ createdAt: { $gte: today } });
		const failedDeliveries = await Parcel.countDocuments({ status: 'Failed' });
		const codAmountAgg = await Parcel.aggregate([
			{ $match: { paymentType: 'COD', status: 'Delivered' } },
			{ $group: { _id: null, total: { $sum: '$codAmount' } } }
		]);
		const codAmount = codAmountAgg[0]?.total || 0;
		res.json({ dailyBookings, failedDeliveries, codAmount });
	} catch (err) {
		res.status(500).json({ message: 'Failed to fetch metrics' });
	}
}

export async function exportCsv(_req, res) {
	try {
		const parcels = await Parcel.find().lean();
		const records = parcels.map(p => ({
			trackingCode: p.trackingCode,
			status: p.status,
			paymentType: p.paymentType,
			codAmount: p.codAmount,
			createdAt: p.createdAt
		}));
		const csvWriter = createObjectCsvWriter({
			path: 'parcels.csv',
			headers: [
				{ id: 'trackingCode', title: 'Tracking Code' },
				{ id: 'status', title: 'Status' },
				{ id: 'paymentType', title: 'Payment' },
				{ id: 'codAmount', title: 'COD Amount' },
				{ id: 'createdAt', title: 'Created At' }
			]
		});
		await csvWriter.writeRecords(records);
		res.download('parcels.csv');
	} catch (err) {
		res.status(500).json({ message: 'CSV export failed' });
	}
}

export async function exportPdf(_req, res) {
	try {
		const doc = new PDFDocument();
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', 'attachment; filename="parcels.pdf"');
		doc.pipe(res);
		doc.fontSize(18).text('Parcels Report', { underline: true });
		doc.moveDown();
		const parcels = await Parcel.find().lean();
		parcels.forEach(p => {
			doc.fontSize(12).text(`Tracking: ${p.trackingCode} | ${p.status} | ${p.paymentType} | COD: ${p.codAmount}`);
		});
		doc.end();
	} catch (err) {
		res.status(500).json({ message: 'PDF export failed' });
	}
}
