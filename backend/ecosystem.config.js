module.exports = {
  apps: [{
    name: 'generic-info-chat-backend',
    script: 'dist/main.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 8000,
    shutdown_with_message: true
  }]
}; 