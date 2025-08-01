#!/bin/bash

# Generic Info Chat Deployment Script
# This script can be run manually on the Ubuntu VM for deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_PATH="/home/ubuntu/generic-info-chat"
BACKEND_NAME="generic-info-chat-backend"
WIDGET_PATH="$PROJECT_PATH/info-chat-widget/dist"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root"
   exit 1
fi

# Function to check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Installing Node.js 22..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        NODE_VERSION=$(node --version)
        log "Node.js version: $NODE_VERSION"
    fi
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        warning "PM2 is not installed. Installing PM2..."
        sudo npm install -g pm2
    else
        PM2_VERSION=$(pm2 --version)
        log "PM2 version: $PM2_VERSION"
    fi
    
    # Check if git is installed
    if ! command -v git &> /dev/null; then
        error "Git is not installed. Installing git..."
        sudo apt update && sudo apt install -y git
    fi
    
    success "Prerequisites check completed"
}

# Function to pull latest changes
pull_changes() {
    log "Pulling latest changes from git..."
    
    cd "$PROJECT_PATH"
    
    # Fetch latest changes
    git fetch origin
    
    # Check if there are changes to pull
    if git diff --quiet HEAD origin/main; then
        warning "No new changes to deploy"
        return 0
    fi
    
    # Reset to latest main branch
    git reset --hard origin/main
    
    # Clean git files but skip typesense-data directory
    echo "Cleaning git files (skipping typesense-data)..."
    git clean -fd || {
        warning "Some files could not be cleaned (likely typesense-data), continuing..."
    }
    
    success "Latest changes pulled successfully"
}

# Function to deploy backend
deploy_backend() {
    log "Deploying backend..."
    
    cd "$PROJECT_PATH/backend"
    
    # Create logs directory if it doesn't exist
    mkdir -p logs
    
    # Install dependencies
    log "Installing backend dependencies..."
    npm ci --production=false || npm install --production=false
    
    # Build the project
    log "Building backend..."
    npm run build
    
    # Stop existing PM2 process if running
    log "Stopping existing backend process..."
    pm2 stop "$BACKEND_NAME" 2>/dev/null || true
    pm2 delete "$BACKEND_NAME" 2>/dev/null || true
    
    # Start backend with PM2
    log "Starting backend with PM2..."
    pm2 start ecosystem.config.js --env production
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 to start on boot (only if not already set)
    if ! pm2 startup | grep -q "already inited"; then
        pm2 startup
    fi
    
    success "Backend deployed successfully"
}

# Function to deploy widget
deploy_widget() {
    log "Deploying info-chat-widget..."
    
    cd "$PROJECT_PATH/info-chat-widget"
    
    # Install dependencies
    log "Installing widget dependencies..."
    npm ci || npm install
    
    # Build widget
    log "Building widget..."
    npm run build
    
    success "Widget deployed successfully"
}

# Function to verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Check if backend is running
    if pm2 list | grep -q "$BACKEND_NAME.*online"; then
        success "Backend is running successfully"
    else
        error "Backend is not running"
        pm2 logs "$BACKEND_NAME" --lines 20
        return 1
    fi
    
    # Check if widget files exist
    if [ -f "$WIDGET_PATH/info-chat-widget.js" ]; then
        success "Widget files deployed successfully"
    else
        error "Widget files not found at $WIDGET_PATH/info-chat-widget.js"
        return 1
    fi
    
    # Show PM2 status
    log "PM2 Status:"
    pm2 status
    
    success "All verifications passed"
}

# Function to show logs
show_logs() {
    log "Recent backend logs:"
    pm2 logs "$BACKEND_NAME" --lines 10
}

# Function to rollback
rollback() {
    log "Rolling back to previous version..."
    
    cd "$PROJECT_PATH"
    
    # Get the previous commit
    PREVIOUS_COMMIT=$(git log --oneline -2 | tail -1 | awk '{print $1}')
    
    if [ -z "$PREVIOUS_COMMIT" ]; then
        error "No previous commit found"
        return 1
    fi
    
    log "Rolling back to commit: $PREVIOUS_COMMIT"
    git reset --hard "$PREVIOUS_COMMIT"
    
    # Redeploy
    deploy_backend
    deploy_widget
    verify_deployment
    
    success "Rollback completed successfully"
}

# Main deployment function
main() {
    log "Starting deployment process..."
    
    check_prerequisites
    pull_changes
    deploy_backend
    deploy_widget
    verify_deployment
    show_logs
    
    success "Deployment completed successfully!"
}

# Function to show usage
usage() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  deploy    - Full deployment (default)"
    echo "  rollback  - Rollback to previous version"
    echo "  logs      - Show recent logs"
    echo "  status    - Show PM2 status"
    echo "  help      - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy"
    echo "  $0 rollback"
    echo "  $0 logs"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback
        ;;
    "logs")
        show_logs
        ;;
    "status")
        pm2 status
        ;;
    "help"|"-h"|"--help")
        usage
        ;;
    *)
        error "Unknown option: $1"
        usage
        exit 1
        ;;
esac 