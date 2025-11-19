#!/bin/bash
set -e

echo "🚀 MarkMEdit Deployment Script"
echo "================================"

# Configuration
SERVER="root@10.0.0.14"
SERVER_PATH="/root/markmedit"

# Function to deploy backend
deploy_backend() {
    echo ""
    echo "📦 Building Backend..."
    cd /config/Development/markmedit/backend
    npm run build
    
    echo "📤 Uploading Backend to Server..."
    ssh $SERVER "mkdir -p $SERVER_PATH/backend/dist"
    rsync -avz --delete ./dist/ $SERVER:$SERVER_PATH/backend/dist/
    rsync -avz ../.env $SERVER:$SERVER_PATH/.env
    rsync -avz ../.env.server $SERVER:$SERVER_PATH/.env.server
    ssh $SERVER "docker cp $SERVER_PATH/.env markmedit-backend:/app/.env"
    ssh $SERVER "docker cp $SERVER_PATH/.env.server markmedit-backend:/app/.env.server"
    
    echo "🔄 Updating Backend Container..."
    ssh $SERVER "docker cp $SERVER_PATH/backend/dist/. markmedit-backend:/app/dist/"
    ssh $SERVER "docker restart markmedit-backend"
    
    echo "✅ Backend deployed!"
}

# Function to deploy frontend
deploy_frontend() {
    echo ""
    echo "📦 Building Frontend..."
    cd /config/Development/markmedit/frontend
    npm run build
    
    echo "📤 Uploading Frontend to Server..."
    ssh $SERVER "mkdir -p $SERVER_PATH/frontend/dist"
    rsync -avz --delete ./dist/ $SERVER:$SERVER_PATH/frontend/dist/
    
    echo "🔄 Updating Frontend Container..."
    ssh $SERVER "docker cp $SERVER_PATH/frontend/dist/. markmedit-frontend:/usr/share/nginx/html/"
    ssh $SERVER "docker exec markmedit-frontend nginx -s reload"
    
    echo "✅ Frontend deployed!"
}

# Function to check health
check_health() {
    echo ""
    echo "🏥 Health Check..."
    
    echo "Backend logs:"
    ssh $SERVER "docker logs markmedit-backend --tail 5"
    
    echo ""
    echo "Frontend status:"
    curl -s http://10.0.0.14:3000/ | grep -o '<title>.*</title>' || echo "❌ Frontend not responding"
    
    echo ""
    echo "Backend API:"
    curl -s http://10.0.0.14:3001/api/documents | head -c 50 || echo "❌ Backend API not responding"
}

# Main deployment logic
case "${1:-all}" in
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all)
        deploy_backend
        deploy_frontend
        ;;
    health)
        check_health
        ;;
    *)
        echo "Usage: $0 {backend|frontend|all|health}"
        echo ""
        echo "Examples:"
        echo "  $0           # Deploy both backend and frontend"
        echo "  $0 backend   # Deploy only backend"
        echo "  $0 frontend  # Deploy only frontend"
        echo "  $0 health    # Check deployment health"
        exit 1
        ;;
esac

if [ "${1:-all}" != "health" ]; then
    check_health
fi

echo ""
echo "🎉 Deployment complete!"
echo "🌐 Frontend: http://10.0.0.14:3000"
echo "🔌 Backend:  http://10.0.0.14:3001"
