const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://practic:practic@cluster1.mantd.mongodb.net/Throne8_App?retryWrites=true&w=majority&family=4');
mongoose.connection.on('open', async () => {
  const db = mongoose.connection.db;
  const comments = await db.collection('comments').find({}).toArray();
  console.log("Total comments in DB:", comments.length);
  if (comments.length > 0) {
    console.log("Sample comment:", JSON.stringify(comments[0], null, 2));
  }
  process.exit(0);
});
