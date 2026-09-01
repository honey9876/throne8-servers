import { MongoClient } from 'mongodb';
async function test() {
  const client = await MongoClient.connect('mongodb://localhost:27017');
  const db = client.db('throne8-db');
  const coll = db.collection('connectionrequests');
  const reqs = await coll.find().toArray();
  console.log('Connection Requests:');
  for (const r of reqs) {
     console.log(`from: ${r.fromUserId}, to: ${r.toUserId}, status: ${r.status}`);
  }
  
  const users = await db.collection('users').find().toArray();
  console.log('\nUsers:');
  for (const u of users) {
     console.log(`_id: ${u._id}, userId: ${u.userId}, name: ${u.firstName}`);
  }
  await client.close();
  process.exit(0);
}
test();
