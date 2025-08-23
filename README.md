# Courier & Parcel Management System (MERN Stack)

A comprehensive logistics management system built with the MERN stack (MongoDB, Express.js, React.js, Node.js) featuring real-time parcel tracking, role-based access control, and OpenStreetMap integration.

## 🚀 Features

### 🔐 Authentication & Authorization
- **User Registration & Login** with JWT tokens
- **Role-based Access Control**: Admin, Delivery Agent, Customer
- **Secure password hashing** using bcryptjs
- **Protected routes** with middleware validation

### 📦 Parcel Management
- **Parcel Booking**: Pickup/delivery addresses, size, type, payment method
- **Payment Types**: COD (Cash on Delivery) and Prepaid
- **Parcel Categories**: Small, Medium, Large sizes
- **Parcel Types**: Document, Fragile, Standard, Perishable
- **Status Tracking**: Pending → Assigned → Picked Up → In Transit → Delivered/Failed
- **Unique Tracking Codes** for each parcel

### 🗺️ Real-time Tracking & Mapping
- **OpenStreetMap Integration** (no Google Maps API required)
- **Live Location Updates** via Socket.IO
- **Real-time Status Updates** for customers
- **Route Visualization** with pickup and delivery points
- **ETA Calculations** and distance tracking

### 👥 Role-specific Features

#### 👨‍💼 Admin Dashboard
- **Analytics Dashboard**: Daily bookings, failed deliveries, COD amounts
- **Agent Assignment**: Assign delivery agents to parcels
- **User Management**: View all users and their roles
- **Report Generation**: CSV and PDF exports
- **System Overview**: Complete parcel and user statistics

#### 🚚 Delivery Agent Dashboard
- **Assigned Parcels**: View and manage assigned deliveries
- **Status Updates**: Update parcel status (Picked Up, In Transit, Delivered, Failed)
- **Live Location Sharing**: Real-time GPS location updates
- **Interactive Map**: OpenStreetMap with current position
- **Parcel Details**: Complete information for each delivery

#### 👤 Customer Dashboard
- **Parcel Booking**: Create new delivery requests
- **Booking History**: View all past and current parcels
- **Real-time Tracking**: Live updates on parcel status and location
- **Public Tracking**: Share tracking links with others
- **Parcel Details**: Complete delivery information

### 📊 Analytics & Reporting
- **Dashboard Metrics**: Real-time statistics and KPIs
- **CSV Export**: Download parcel data in spreadsheet format
- **PDF Reports**: Generate printable delivery reports
- **Performance Tracking**: Monitor delivery success rates

### 🔌 Real-time Communication
- **Socket.IO Integration**: Instant updates across all clients
- **Live Notifications**: Status changes and location updates
- **Multi-room Support**: Efficient event broadcasting
- **Connection Management**: Automatic reconnection handling

## 🏗️ Architecture

### Backend (Node.js + Express)
```
server/
├── src/
│   ├── config/          # Database configuration
│   ├── controllers/     # Business logic handlers
│   ├── middleware/      # Authentication & validation
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API endpoints
│   ├── services/        # Socket.IO handlers
│   └── utils/           # JWT utilities
├── scripts/             # Database seeding
└── package.json
```

### Frontend (React + Vite)
```
client/
├── src/
│   ├── components/      # Reusable UI components
│   ├── context/         # Authentication context
│   ├── pages/           # Route components
│   ├── routes/          # Protected route logic
│   ├── api.js           # API client
│   └── socket.js        # Socket.IO client
├── public/              # Static assets
└── package.json
```

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-time**: Socket.IO
- **Validation**: Express-validator
- **Security**: bcryptjs for password hashing
- **Reporting**: CSV-writer, PDFKit
- **Utilities**: UUID generation, Morgan logging

### Frontend
- **Framework**: React 19 with Vite
- **Routing**: React Router DOM v7
- **Styling**: Tailwind CSS
- **Maps**: Leaflet.js with OpenStreetMap
- **Real-time**: Socket.IO client
- **State Management**: React Context API
- **Build Tool**: Vite with PostCSS

### Database
- **MongoDB**: NoSQL document database
- **Mongoose**: Object Data Modeling
- **Schemas**: User, Parcel with embedded location data

## 📋 Prerequisites

- **Node.js**: Version 20 or higher
- **MongoDB**: Running locally or cloud instance
- **Git**: For cloning the repository
- **Modern Browser**: Chrome, Firefox, Safari, Edge

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd courier-parcel-management-system
```

### 2. Environment Configuration

#### Backend Environment
Create `server/.env` file:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/courier_db
JWT_SECRET=your_super_secret_jwt_key_here
CLIENT_ORIGIN=http://localhost:5173
SOCKET_CORS_ORIGIN=http://localhost:5173
```

#### Frontend Environment
Create `client/.env` file:
```env
VITE_API_BASE=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### 3. Install Dependencies
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd ../client && npm install
```

### 4. Database Setup
```bash
# Start MongoDB (if running locally)
mongod

# Seed the database with sample data
cd server && npm run seed
```

### 5. Start the Application
```bash
# Terminal 1: Start backend server
cd server && npm run dev

# Terminal 2: Start frontend development server
cd client && npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health

## 📚 API Documentation

### Authentication Endpoints
```
POST /api/auth/register    # User registration
POST /api/auth/login       # User authentication
```

### Parcel Management
```
GET    /api/parcels              # List parcels (role-aware)
POST   /api/parcels              # Create new parcel
GET    /api/parcels/:id          # Get parcel details
DELETE /api/parcels/:id          # Delete parcel (admin only)
POST   /api/parcels/:id/assign  # Assign delivery agent
POST   /api/parcels/:id/status  # Update parcel status
POST   /api/parcels/:id/location # Update current location
GET    /api/parcels/track/:code # Public tracking by code
```

### Analytics & Reports
```
GET /api/analytics/dashboard     # Dashboard metrics
GET /api/analytics/export/csv   # Export to CSV
GET /api/analytics/export/pdf   # Export to PDF
```

### User Management
```
GET /api/users                   # List users (admin only)
GET /api/users/:id               # Get user details
```

## 🔐 User Roles & Permissions

### Admin
- Full system access
- User management
- Agent assignment
- Analytics and reporting
- Parcel deletion
- System configuration

### Delivery Agent
- View assigned parcels
- Update parcel status
- Share live location
- Access delivery routes
- Update delivery notes

### Customer
- Book new parcels
- View booking history
- Track parcels in real-time
- Access public tracking
- Update personal information

## 🗺️ Mapping & Location Features

### OpenStreetMap Integration
- **No API Key Required**: Free and open-source mapping
- **Leaflet.js**: Lightweight mapping library
- **Real-time Updates**: Live location tracking
- **Route Visualization**: Pickup to delivery routes
- **Interactive Markers**: Parcel and agent locations

### Location Services
- **GPS Integration**: Real-time agent positioning
- **Geolocation API**: Browser-based location services
- **Coordinate Storage**: MongoDB geospatial data
- **ETA Calculations**: Estimated delivery times

## 📱 Real-time Features

### Socket.IO Events
- **Parcel Updates**: Status changes and assignments
- **Location Updates**: Real-time GPS coordinates
- **Agent Tracking**: Live delivery agent positions
- **Customer Notifications**: Instant status updates

### Live Updates
- **Status Changes**: Immediate notification across all clients
- **Location Sharing**: Real-time coordinate updates
- **Assignment Updates**: Instant agent assignment notifications
- **Connection Management**: Automatic reconnection handling

## 🎨 User Interface

### Design System
- **Tailwind CSS**: Utility-first CSS framework
- **Responsive Design**: Mobile-first approach
- **Modern UI**: Clean and intuitive interface
- **Component Library**: Reusable UI components

### Key Pages
- **Login/Register**: Authentication forms
- **Admin Dashboard**: Analytics and management
- **Agent Dashboard**: Delivery management
- **Customer Dashboard**: Booking and tracking
- **Public Tracking**: Shareable tracking pages

## 🧪 Testing & Development

### Development Scripts
```bash
# Backend
npm run dev          # Start development server
npm run seed         # Seed database with sample data

# Frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Database Seeding
The system includes sample data for testing:
- Sample users (admin, agents, customers)
- Sample parcels with various statuses
- Test tracking codes for demonstration

## 🚀 Deployment

### Backend Deployment
- **Vercel**: Serverless deployment with `vercel.json`
- **Environment Variables**: Configure production settings
- **MongoDB Atlas**: Cloud database connection
- **CORS Configuration**: Production domain settings

### Frontend Deployment
- **Vite Build**: Optimized production build
- **Static Hosting**: Deploy to any static host
- **Environment Variables**: Production API endpoints

## 🔒 Security Features

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcryptjs with salt rounds
- **CORS Protection**: Cross-origin request handling
- **Input Validation**: Express-validator middleware
- **Role-based Access**: Protected route middleware
- **Secure Headers**: Security best practices

## 📊 Performance & Scalability

- **MongoDB Indexing**: Optimized database queries
- **Socket.IO Rooms**: Efficient event broadcasting
- **React Optimization**: Component memoization
- **Lazy Loading**: Route-based code splitting
- **Caching**: Browser-based caching strategies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the code examples

## 🔮 Future Enhancements

- **QR Code Generation**: Parcel identification
- **Barcode Scanning**: Agent confirmation
- **Email/SMS Notifications**: Customer updates
- **Multi-language Support**: Internationalization
- **Mobile App**: React Native version
- **Advanced Analytics**: Machine learning insights
- **Payment Integration**: Online payment processing
- **Inventory Management**: Warehouse integration

---

**Built with ❤️ using the MERN Stack**
