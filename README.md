# Courier & Parcel Management System (MERN)

Monorepo with `server` (Express + MongoDB + JWT + Socket.IO) and `client` (React + Vite).

## Quickstart

1. Prerequisites: Node 20+, MongoDB running locally
2. Create env files
   - server: create `server/.env` from the following
```
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/courier_db
JWT_SECRET=change_this_secret
CLIENT_ORIGIN=http://localhost:5173
SOCKET_CORS_ORIGIN=http://localhost:5173
```
   - client: create `client/.env` from the following
```
VITE_API_BASE=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```
3. Install deps
```
# root
npm install
# server
cd server && npm install
# client
cd ../client && npm install
```
4. Run
```
# in two terminals or use root concurrently later
cd server && npm run dev
cd client && npm run dev
```

## Features
- Roles: Admin, Delivery Agent, Customer
- Auth: Register/Login with JWT
- Parcel: CRUD, agent assignment, status and live location updates
- Analytics: dashboard metrics, CSV/PDF exports
- Real-time: Socket.IO events on status/location updates
- Frontend: minimal pages (auth, booking, list)

## API (high level)
- POST `/api/auth/register`, `/api/auth/login`
- GET `/api/parcels` (role-aware), POST `/api/parcels`
- GET `/api/parcels/:id`, DELETE `/api/parcels/:id` (admin)
- POST `/api/parcels/:id/assign` (admin)
- POST `/api/parcels/:id/status` (agent/admin)
- POST `/api/parcels/:id/location` (agent)
- GET `/api/analytics/dashboard|export/csv|export/pdf` (admin)

## Todo / Next
- Admin UI (assign agents, metrics dashboard)
- Agent UI (assigned list, update status/location, route view via Google Maps)
- Real-time map tracking with Google Maps JS SDK
- QR/Barcode, email/SMS, i18n
