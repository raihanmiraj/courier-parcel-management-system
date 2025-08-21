import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_BASE, withCredentials: false });

api.interceptors.request.use((config) => {
	const token = localStorage.getItem('token');
	if (token) config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
	return config;
});

export async function apiFetch(path, options = {}) {
	const method = (options.method || 'GET').toLowerCase();
	const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
	const data = options.body ?? undefined;
	const res = await api.request({ url: path, method, headers, data });
	return res.data;
}

export async function apiFetchBlob(path, options = {}) {
	const method = (options.method || 'GET').toLowerCase();
	const headers = { ...(options.headers || {}) };
	const data = options.body ?? undefined;
	const res = await api.request({ url: path, method, headers, data, responseType: 'blob' });
	return res.data;
}

export { api };
