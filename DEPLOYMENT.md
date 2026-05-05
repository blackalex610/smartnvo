# Deployment Guide — Vercel

This guide explains how to deploy the Математика project to Vercel using the experimental services feature for monorepo support.

## Prerequisites

1. **GitHub Repository**: Push your code to GitHub (see README for instructions)
2. **Vercel Account**: Create a free account at https://vercel.com
3. **Environment Variables**: Have these ready to configure in Vercel

## Deployment Steps

### Step 1: Connect to Vercel

1. Go to https://vercel.com/new
2. Click "Continue with GitHub"
3. Authorize Vercel to access your GitHub account
4. Select your `smartnvo` repository
5. Click "Import"

### Step 2: Configure Project Settings

**Root Directory**: Leave as default (root of repo)

**Build & Development Settings**:
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: `frontend/dist`

### Step 3: Set Environment Variables

Add the following environment variables in Vercel dashboard:

#### Frontend Environment Variables
```
VITE_API_URL=https://your-deployment-url/_/backend
VITE_REALTIME_URL=your-realtime-server-url
```

#### Backend Environment Variables
```
DATABASE_URL=your-postgresql-connection-string
OPENAI_API_KEY=your-openai-api-key
JWT_SECRET=your-jwt-secret-key
ALLOWED_ORIGINS=https://your-deployment-url
```

### Step 4: Deploy

Click "Deploy" and Vercel will:
1. Install dependencies for frontend and backend
2. Build the frontend (Vite)
3. Set up the backend as serverless functions
4. Deploy everything together

## Architecture

```
Your Vercel Deployment
├── Frontend (Vite)
│   └── Served at: https://your-deployment-url/
├── Backend API (FastAPI)
│   └── Served at: https://your-deployment-url/_/backend/
└── Real-time Server (separate deployment)
    └── Served at: https://realtime-url/ (separate Node.js hosting)
```

## Post-Deployment

After successful deployment:

1. **Test the Frontend**
   - Visit https://your-deployment-url
   - Check console for any API errors

2. **Test the Backend API**
   - Visit https://your-deployment-url/_/backend/docs
   - Should show FastAPI Swagger documentation

3. **Configure Real-time Server**
   - The real-time server (WebSocket) needs separate hosting
   - Options: Railway, Render, AWS EC2, Heroku
   - Update `VITE_REALTIME_URL` with the actual deployment URL

## Troubleshooting

### Issue: Frontend can't reach backend API

**Solution**: Ensure `VITE_API_URL` environment variable is set to the correct Vercel URL with `/_/backend` prefix.

### Issue: CORS errors

**Solution**: Update `ALLOWED_ORIGINS` in backend environment variables to include your Vercel domain.

### Issue: Database connection fails

**Solution**: Verify `DATABASE_URL` is correct and your database is accessible from Vercel (may need to whitelist Vercel IPs or use Vercel Postgres).

### Issue: Missing dependencies

**Solution**: Ensure all Python requirements are in `backend/requirements.txt` and `backend/venv` is in `.gitignore`.

## Environment Variables Reference

### Frontend (.env)

```env
# API endpoint for backend calls
VITE_API_URL=https://your-deployment-url/_/backend

# Real-time server for WebSocket connections
VITE_REALTIME_URL=https://realtime-server-url

# Google OAuth (optional)
VITE_GOOGLE_CLIENT_ID=your-google-client-id

# App name
VITE_APP_NAME=Математика
```

### Backend (environment)

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# API Configuration
ALLOWED_ORIGINS=https://your-deployment-url,http://localhost:3000

# AI Service
OPENAI_API_KEY=your-openai-api-key

# Server
DEBUG=False
ENVIRONMENT=production
```

## Real-time Server Deployment

The real-time server (WebSocket) needs separate hosting since Vercel's serverless functions don't support persistent WebSocket connections.

### Option 1: Railway (Recommended)

1. Go to https://railway.app
2. Connect your GitHub repository
3. Set `Root Directory` to `realtime-server`
4. Add environment variables
5. Deploy

### Option 2: Render

1. Go to https://render.com
2. New → Web Service
3. Connect GitHub
4. Select `realtime-server` directory
5. Deploy

### Option 3: Heroku

```bash
# Install Heroku CLI and login
heroku create smartnvo-realtime
heroku config:set NODE_ENV=production
git subtree push --prefix realtime-server heroku main
```

## Monitoring & Logs

### View Vercel Logs

1. Go to your Vercel project dashboard
2. Click "Deployments" tab
3. Click on the latest deployment
4. View build logs and runtime logs

### View Backend Errors

- Check CloudWatch or Vercel's function logs
- Errors will appear in deployment details

## Performance Tips

1. **Enable Vercel Analytics**: Dashboard → Settings → Analytics
2. **Use Image Optimization**: Vercel automatically optimizes images
3. **Monitor Function Duration**: Keep backend functions under 10s
4. **Use Caching**: Set proper cache headers in frontend

## Limitations & Considerations

- **Function Timeout**: Vercel serverless functions timeout after 10-60 seconds (depending on plan)
- **WebSockets**: Must use separate Node.js hosting for real-time features
- **Database**: Use Vercel Postgres or external PostgreSQL service
- **File Storage**: Use cloud storage (AWS S3, etc.) for file uploads

## Support

For Vercel-specific issues, check:
- https://vercel.com/docs
- https://vercel.com/support

For project-specific issues, check the GitHub repository issues.
