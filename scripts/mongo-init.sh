#!/bin/bash
# ============================================================
# scripts/mongo-init.sh
# MongoDB Replica Set initialize + App user create karo
# ============================================================

set -e

echo "⏳ Waiting for MongoDB nodes to be ready..."
sleep 15

# Primary se connect karke replica set initiate karo
mongosh --host mongo-1:27017 \
    -u "$MONGO_ROOT_USER" \
    -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "
    // Check if already initialized
    try {
        const status = rs.status();
        if (status.ok === 1) {
            print('✅ Replica set already initialized');
            quit(0);
        }
    } catch(e) {
        print('Initializing replica set...');
    }

    // Initialize replica set
    const result = rs.initiate({
        _id: 'rs0',
        members: [
            { _id: 0, host: 'mongo-1:27017', priority: 2 },
            { _id: 1, host: 'mongo-2:27017', priority: 1 },
            { _id: 2, host: 'mongo-3:27017', priority: 1 }
        ]
    });

    if (result.ok !== 1) {
        print('❌ Replica set init failed: ' + JSON.stringify(result));
        quit(1);
    }

    print('✅ Replica set initiated, waiting for election...');
    " 2>&1

echo "⏳ Waiting for primary election (30s)..."
sleep 30

# App user banao
mongosh --host mongo-1:27017 \
    -u "$MONGO_ROOT_USER" \
    -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "
    // Database switch
    const db = db.getSiblingDB('$MONGO_DB_NAME');

    // Check if user exists
    const existingUsers = db.getUsers();
    const userExists = existingUsers.users.some(u => u.user === '$MONGO_APP_USER');

    if (userExists) {
        print('✅ App user already exists');
    } else {
        db.createUser({
            user: '$MONGO_APP_USER',
            pwd: '$MONGO_APP_PASSWORD',
            roles: [
                { role: 'readWrite', db: '$MONGO_DB_NAME' },
                { role: 'dbAdmin', db: '$MONGO_DB_NAME' }
            ]
        });
        print('✅ App user created: $MONGO_APP_USER');
    }

    // Verify replica set status
    const adminDb = db.getSiblingDB('admin');
    const rsStatus = adminDb.runCommand({ replSetGetStatus: 1 });
    print('📊 Replica set members: ' + rsStatus.members.length);
    rsStatus.members.forEach(m => {
        print('  - ' + m.name + ' | state: ' + m.stateStr);
    });
    " 2>&1

echo "✅ MongoDB initialization complete!"