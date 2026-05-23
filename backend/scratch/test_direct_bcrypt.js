const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './.env' });

const mongoUri = process.env.MONGO_URI;

async function main() {
  await mongoose.connect(mongoUri);
  const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    role: String
  }, { collection: 'users' });
  const User = mongoose.models.User || mongoose.model('User', userSchema);

  const admin = await User.findOne({ email: 'admin@gmail.com' });
  if (!admin) {
    console.log('No admin found at admin@gmail.com');
  } else {
    console.log('Admin found:', admin.email);
    console.log('Admin role:', admin.role);
    console.log('Admin password hash:', admin.password);
    const match = await bcrypt.compare('admin123', admin.password);
    console.log('Does "admin123" match the hash?', match);
  }
  await mongoose.disconnect();
}
main();
