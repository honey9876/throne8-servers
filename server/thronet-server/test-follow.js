const mongoose = require('mongoose');
const { Follow } = require('./src/connections/models/Follow');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/throne8');
  const follows = await mongoose.connection.db.collection('follows').find().toArray();
  console.log(JSON.stringify(follows, null, 2));
  process.exit(0);
}
check();
