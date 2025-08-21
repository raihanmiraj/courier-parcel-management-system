export function registerSocketHandlers(io) {
	io.on('connection', socket => {
		const userId = socket.handshake.query.userId;
		if (userId) {
			socket.join(`user:${userId}`);
		}
		
		socket.on('subscribe:parcel', parcelId => {
			if (parcelId) socket.join(`parcel:${parcelId}`);
		});
		
		socket.on('unsubscribe:parcel', parcelId => {
			if (parcelId) socket.leave(`parcel:${parcelId}`);
		});
		
		// Handle agent location updates
		socket.on('agent:location:update', (data) => {
			const { agentId, location, timestamp } = data;
			
			// Emit location update to all clients tracking parcels assigned to this agent
			// This will be used by customers tracking their parcels
			socket.broadcast.emit('agent:location:update', {
				agentId,
				location,
				timestamp
			});
			
			// Also emit to specific parcel rooms if we have parcel IDs
			// This will be handled by the parcel controller when updating location
		});
		
		socket.on('disconnect', () => {});
	});
}
