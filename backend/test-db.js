const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;
console.log('Testing connection to:', mongoUri ? mongoUri.split('@')[1] : 'undefined');

mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 5000,
})
.then(() => {
  console.log('✅ Connected successfully!');
  process.exit(0);
})
.catch(err => {
  console.error('❌ Connection failed:');
  console.error(err);
  process.exit(1);
});
