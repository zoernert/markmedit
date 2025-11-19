# MarkMEdit Deployment Guide

## Server Information
- **URL**: http://10.0.0.14:3000
- **Backend API**: http://10.0.0.14:3001
- **Server**: root@10.0.0.14
- **Path**: /root/markmedit

## Quick Deployment

### Option 1: Using the Deploy Script (Recommended)

```bash
# Deploy everything (backend + frontend)
./deploy.sh

# Deploy only backend
./deploy.sh backend

# Deploy only frontend
./deploy.sh frontend

# Check health status
./deploy.sh health
```

### Option 2: Manual Deployment

#### Backend Deployment

```bash
# 1. Build backend
cd /config/Development/markmedit/backend
npm run build

# 2. Upload to server
ssh root@10.0.0.14 "mkdir -p /root/markmedit/backend/dist"
rsync -avz --delete ./dist/ root@10.0.0.14:/root/markmedit/backend/dist/

# 3. Update running container
ssh root@10.0.0.14 "docker cp /root/markmedit/backend/dist/. markmedit-backend:/app/dist/"
ssh root@10.0.0.14 "docker restart markmedit-backend"

# 4. Check logs
ssh root@10.0.0.14 "docker logs markmedit-backend --tail 20"
```

#### Frontend Deployment

```bash
# 1. Build frontend
cd /config/Development/markmedit/frontend
npm run build

# 2. Upload to server
ssh root@10.0.0.14 "mkdir -p /root/markmedit/frontend/dist"
rsync -avz --delete ./dist/ root@10.0.0.14:/root/markmedit/frontend/dist/

# 3. Update running container
ssh root@10.0.0.14 "docker cp /root/markmedit/frontend/dist/. markmedit-frontend:/usr/share/nginx/html/"
ssh root@10.0.0.14 "docker exec markmedit-frontend nginx -s reload"

# 4. Verify
curl -s http://10.0.0.14:3000/ | grep '<title>'
```

## Important Notes

### Why docker cp instead of rebuild?

The containers use **baked-in images** from the initial build. When you update code:

- ❌ `docker restart` alone **will not** pick up new code
- ❌ Files in `/root/markmedit/backend/dist` are **not** mounted as volumes
- ✅ `docker cp` directly updates files **inside** the running container
- ✅ Then `docker restart` applies the changes

### Alternative: Full Rebuild (Slower)

If you need a complete rebuild (e.g., after dependency changes):

```bash
ssh root@10.0.0.14 "cd /root/markmedit && docker compose build backend && docker compose up -d backend"
```

⚠️ **Note**: This requires docker-compose.yml and Dockerfiles on the server.

## Container Management

### Check Container Status
```bash
ssh root@10.0.0.14 "docker ps | grep markmedit"
```

### View Logs
```bash
# Backend logs
ssh root@10.0.0.14 "docker logs -f markmedit-backend"

# Frontend logs (nginx)
ssh root@10.0.0.14 "docker logs -f markmedit-frontend"
```

### Restart Containers
```bash
ssh root@10.0.0.14 "docker restart markmedit-backend markmedit-frontend"
```

### Access Container Shell
```bash
# Backend
ssh root@10.0.0.14 "docker exec -it markmedit-backend sh"

# Frontend
ssh root@10.0.0.14 "docker exec -it markmedit-frontend sh"
```

## Troubleshooting

### Backend returns 500 errors
```bash
# Check recent errors
ssh root@10.0.0.14 "docker logs markmedit-backend --tail 50 | grep -i error"

# Verify deployed code
ssh root@10.0.0.14 "docker exec markmedit-backend ls -la /app/dist/routes/"
```

### Frontend shows old version
```bash
# Check asset hashes in index.html
ssh root@10.0.0.14 "docker exec markmedit-frontend cat /usr/share/nginx/html/index.html | grep assets"

# Verify assets exist
ssh root@10.0.0.14 "docker exec markmedit-frontend ls -la /usr/share/nginx/html/assets/"

# Force browser cache clear: Ctrl+Shift+R
```

### Database issues
```bash
# Check database file
ssh root@10.0.0.14 "docker exec markmedit-backend ls -la /app/data/"

# Backup database
ssh root@10.0.0.14 "docker exec markmedit-backend sqlite3 /app/data/markmedit.db '.backup /app/data/backup.db'"
```

## Development Workflow

1. **Make code changes** locally in `/config/Development/markmedit`
2. **Test locally** (optional):
   ```bash
   cd backend && npm run dev
   cd frontend && npm run dev
   ```
3. **Deploy to server**:
   ```bash
   ./deploy.sh
   ```
4. **Verify** in browser: http://10.0.0.14:3000
5. **Check logs** if issues occur

## Environment Variables

Backend uses `.env` file on server:
- Location: `/root/markmedit/.env` (if using docker-compose volumes)
- Or set directly in Dockerfile/docker-compose.yml

To update env vars:
```bash
# Edit on server
ssh root@10.0.0.14 "nano /root/markmedit/.env"

# Restart to apply
ssh root@10.0.0.14 "docker restart markmedit-backend"
```

## Deployment Checklist

- [ ] Code changes committed locally
- [ ] Backend tests pass (if any)
- [ ] Frontend builds without errors
- [ ] Deploy script executed successfully
- [ ] Backend health check passes
- [ ] Frontend loads in browser
- [ ] New features tested on server
- [ ] No errors in backend logs
