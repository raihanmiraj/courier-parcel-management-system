# Environment Variables Setup Guide

## Overview
This guide explains how to set up environment variables for the Courier Parcel Management System server.

## Quick Start

### 1. Create Environment File
Copy the example file and create your own `.env` file:

```bash
# On Windows
copy env.example .env

# On macOS/Linux
cp env.example .env
```

### 2. Configure Required Variables
Edit the `.env` file and set your actual values for the required variables.

## Required Environment Variables

### 🔐 Authentication & Security
```env
# JWT Configuration (REQUIRED)
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
JWT_EXPIRE=24h
JWT_REFRESH_EXPIRE=7d
```

### 🗄️ Database Configuration
```env
# MongoDB (REQUIRED)
MONGODB_URI=mongodb://localhost:27017/courier_parcel_system
MONGODB_URI_PROD=mongodb+srv://username:password@cluster.mongodb.net/database
```

### 📧 Email Configuration (REQUIRED)
```env
# SMTP Settings
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_USER=your_email@gmail.com
MAIL_PASS=your_app_password_here
MAIL_SECURE=true
MAIL_FROM=your_email@gmail.com
MAIL_FROM_NAME=Courier Parcel System
```

### 🌐 Server Configuration
```env
# Server Settings
PORT=5000
NODE_ENV=development
SOCKET_CORS_ORIGIN=http://localhost:3000
```

## Email Setup Instructions

### Gmail SMTP Setup
1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password:**
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
3. **Use the generated password** as `MAIL_PASS`

### Other SMTP Providers
```env
# Outlook/Hotmail
MAIL_HOST=smtp-mail.outlook.com
MAIL_PORT=587
MAIL_SECURE=false

# Yahoo
MAIL_HOST=smtp.mail.yahoo.com
MAIL_PORT=587
MAIL_SECURE=false

# Custom SMTP
MAIL_HOST=your.smtp.server.com
MAIL_PORT=587
MAIL_SECURE=false
```

## Security Best Practices

### 1. JWT Secret
- Use a long, random string (at least 32 characters)
- Include uppercase, lowercase, numbers, and special characters
- Never commit to version control

### 2. Database Credentials
- Use strong passwords
- Limit database user permissions
- Use connection strings with authentication

### 3. Email Security
- Use app-specific passwords, not your main password
- Enable 2FA on email accounts
- Use secure connections (TLS/SSL)

## Environment-Specific Configuration

### Development
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/courier_dev
LOG_LEVEL=debug
```

### Production
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/prod_db
LOG_LEVEL=error
MAIL_SECURE=true
```

### Testing
```env
NODE_ENV=test
PORT=5001
MONGODB_URI=mongodb://localhost:27017/courier_test
LOG_LEVEL=warn
```

## Troubleshooting

### Common Issues

#### 1. Email Not Working
```bash
# Check if environment variables are loaded
console.log('MAIL_USER:', process.env.MAIL_USER);
console.log('MAIL_PASS:', process.env.MAIL_PASS ? '***SET***' : 'NOT SET');

# Verify SMTP settings
# Test connection manually
```

#### 2. Database Connection Failed
```bash
# Check MongoDB status
mongod --version
systemctl status mongod

# Verify connection string
# Check network connectivity
```

#### 3. JWT Authentication Fails
```bash
# Verify JWT_SECRET is set
# Check token expiration settings
# Validate token format
```

### Debug Mode
```env
# Enable debug logging
LOG_LEVEL=debug
NODE_ENV=development
DEBUG=*
```

## File Structure
```
server/
├── .env                    # Your actual environment file (create this)
├── env.example            # Example environment file (this file)
├── .gitignore             # Should include .env
└── src/
    └── utils/
        └── mailer.js      # Uses environment variables
```

## Git Ignore
Make sure your `.gitignore` includes:
```gitignore
# Environment files
.env
.env.local
.env.production
.env.staging

# But allow example files
!env.example
!.env.example
```

## Validation
The server will validate required environment variables on startup:
- ✅ JWT_SECRET
- ✅ MONGODB_URI  
- ✅ MAIL_USER
- ✅ MAIL_PASS

Missing variables will cause the server to exit with an error message.

## Support
If you encounter issues:
1. Check the error messages in the console
2. Verify all required variables are set
3. Test email configuration manually
4. Check database connectivity
5. Review security settings

## Security Notes
⚠️ **IMPORTANT:** Never commit your `.env` file to version control!
- It contains sensitive information
- Use `.env.example` for documentation
- Set actual values in deployment environments
- Use secrets management in production
