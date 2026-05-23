const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const userSchema = new mongoose.Schema({}, { strict: false });
    const User = mongoose.models.User || mongoose.model('User', userSchema);

    const email = 'admin@gmail.com';
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.findOneAndUpdate(
      { email },
      {
        email,
        password: hashedPassword,
        role: 'admin',
        displayName: 'Admin User',
        status: 'active'
      },
      { upsert: true, new: true }
    );

    console.log('Admin user created/updated successfully.');
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

createAdmin();
