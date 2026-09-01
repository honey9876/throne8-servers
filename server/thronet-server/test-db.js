import { MongoClient } from 'mongodb';

async function test() {
  const client = await MongoClient.connect('mongodb://localhost:27017');
  const db = client.db('throne8-db'); // Check throne8-db
  const coll = db.collection('connectionrequests');
  const allReqs = await coll.find().toArray();
  console.log('All requests count:', allReqs.length);
  if (allReqs.length > 0) {
     console.log('Sample request:', JSON.stringify(allReqs[0], null, 2));
  }
  await client.close();
  process.exit(0);
}
test();
