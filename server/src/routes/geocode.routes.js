import express from 'express';

const router = express.Router();

router.get('/search', async (req, res) => {
	try {
		const query = (req.query.q || '').toString().trim();
		const limit = Number(req.query.limit || 1);
		if (!query) {
			return res.status(400).json({ message: 'Missing q parameter' });
		}

		const url = new URL('https://nominatim.openstreetmap.org/search');
		url.searchParams.set('format', 'json');
		url.searchParams.set('q', query);
		url.searchParams.set('limit', String(limit));

		const upstream = await fetch(url.toString(), {
			headers: {
				'User-Agent': 'CourierParcelApp/1.0 (contact: example@example.com)',
				Accept: 'application/json',
				'Referer': process.env.CLIENT_ORIGIN || 'http://localhost:5173',
				'Accept-Language': 'en'
			}
		});

		if (!upstream.ok) {
			return res.status(upstream.status).json({ message: `Geocoding error (${upstream.status})` });
		}

		const data = await upstream.json();
		return res.json(data);
	} catch (err) {
		return res.status(500).json({ message: 'Geocoding failed' });
	}
});

export default router;


