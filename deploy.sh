#!/bin/bash

# Deployment Script for Login App
# Usage: ./deploy.sh [dev|prod]

ENV=$1

if [ -z "$ENV" ]; then
    echo "Usage: ./deploy.sh [dev|prod]"
    exit 1
fi

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo "Invalid environment. Use 'dev' or 'prod'."
    exit 1
fi

echo "🚀 Starting deployment for environment: $ENV"

# 1. Check Prerequisites
echo "🔍 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v mysql &> /dev/null; then
    echo "⚠️  MySQL client is not installed. Database setup might fail."
fi

# 2. Install Dependencies
echo "📦 Installing dependencies..."
if [ "$ENV" == "prod" ]; then
    npm ci --only=production
else
    npm install
fi

# 3. MySQL Setup (Optional)
DB_HOST="localhost"
DB_NAME="login_db"
DB_USER="root"
DB_PASS="password"

read -p "🗄️  Do you want to create a NEW MySQL database and user? (y/n) " create_db_user
if [ "$create_db_user" == "y" ]; then
    read -p "Enter MySQL Root Password (leave empty for no password): " -s MYSQL_ROOT_PASS
    echo ""
    read -p "Enter New Database Name (default: login_app_db): " NEW_DB_NAME
    NEW_DB_NAME=${NEW_DB_NAME:-login_app_db}
    read -p "Enter New User Name (default: login_app_user): " NEW_DB_USER
    NEW_DB_USER=${NEW_DB_USER:-login_app_user}
    read -p "Enter New User Password: " -s NEW_DB_PASS
    echo ""
    
    echo "Creating Database and User..."
    
    # Construct MySQL command prefix based on password existence
    if [ -z "$MYSQL_ROOT_PASS" ]; then
        MYSQL_CMD="mysql -u root"
    else
        MYSQL_CMD="mysql -u root -p$MYSQL_ROOT_PASS"
    fi

    $MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS $NEW_DB_NAME;"
    $MYSQL_CMD -e "CREATE USER IF NOT EXISTS '$NEW_DB_USER'@'localhost' IDENTIFIED BY '$NEW_DB_PASS';"
    $MYSQL_CMD -e "GRANT ALL PRIVILEGES ON $NEW_DB_NAME.* TO '$NEW_DB_USER'@'localhost';"
    $MYSQL_CMD -e "FLUSH PRIVILEGES;"
    
    if [ $? -eq 0 ]; then
        echo "✅ Database and User created successfully."
        DB_NAME=$NEW_DB_NAME
        DB_USER=$NEW_DB_USER
        DB_PASS=$NEW_DB_PASS
    else
        echo "❌ Failed to create database/user. Please check your root password."
        exit 1
    fi
fi

# 4. Setup Environment Variables
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    read -p "Do you want to create one from a template? (y/n) " create_env
    if [ "$create_env" == "y" ]; then
        echo "DB_HOST=$DB_HOST" > .env
        echo "DB_USER=$DB_USER" >> .env
        echo "DB_PASSWORD=$DB_PASS" >> .env
        echo "DB_NAME=$DB_NAME" >> .env
        echo "SESSION_SECRET=change_this_secret" >> .env
        echo "PORT=3000" >> .env
        echo "✅ .env created with configured credentials."
    fi
else
    echo "✅ .env file found."
fi

# 5. Database Setup
read -p "🗄️  Do you want to initialize/reset the database? (y/n) " setup_db
if [ "$setup_db" == "y" ]; then
    echo "Running database initialization..."
    
    read -p "🌱 Do you want to seed initial data? (y/n) " seed_db
    # if [ "$seed_db" == "y" ]; then
    # fi
fi

# 6. Start Application
echo "🚀 Starting application..."

if [ "$ENV" == "dev" ]; then
    if command -v nodemon &> /dev/null; then
        nodemon server.js
    else
        echo "ℹ️  nodemon not found, running with node..."
        node server.js
    fi
elif [ "$ENV" == "prod" ]; then
    if ! command -v pm2 &> /dev/null; then
        echo "⚠️  PM2 not found. Installing globally..."
        npm install -g pm2
    fi
    
    pm2 start server.js --name "login-app"
    pm2 save
    echo "✅ Application started with PM2."
fi
