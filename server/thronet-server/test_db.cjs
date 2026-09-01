const mongoose = require('mongoose');
const uri = "mongodb+srv://practic:practic@cluster1.mantd.mongodb.net/Throne8_App?retryWrites=true&w=majority&family=4";
async function run() {
  await mongoose.connect(uri);
  const count = await mongoose.connection.db.collection('users').countDocuments();
  console.log("Total users in DB:", count);
  const someUser = await mongoose.connection.db.collection('users').findOne({});
  console.log("Sample user email:", someUser ? someUser.email : "none");
  process.exit(0);
}
run().catch(console.error);
