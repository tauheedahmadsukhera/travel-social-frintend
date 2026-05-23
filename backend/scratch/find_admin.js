const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './.env' }); // Load from current directory (backend)

const mongoUri = process.env.MONGO_URI || "mongodb://martin:martinadmin@ac-qemnb5t-shard-00-00.st1rogr.mongodb.net:27017,ac-qemnb5t-shard-00-01.st1rogr.mongodb.net:27017,ac-qemnb5t-shard-00-02.st1rogr.mongodb.net:27017/travesocial?ssl=true&replicaSet=atlas-13h75w-shard-0&authSource=admin&retryWrites=true&w=majority";

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected!');

  // Define User Schema inline
  const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    role: String,
    displayName: String
  }, { collection: 'users' });

  const User = mongoose.models.User || mongoose.model('User', userSchema);

  // Find admins
  const admins = await User.find({ role: 'admin' });
  console.log(`Found ${admins.length} admin(s)`);
  
  if (admins.length > 0) {
    admins.forEach(admin => {
      console.log(`- Email: ${admin.email}, Name: ${admin.displayName}`);
    });
  } else {
    console.log('No admin users found! Let\'s create one...');
    const hashedPassword = await bcrypt.hash('adminpassword123', 10);
    const newAdmin = new User({
      email: 'admin@trips.com',
      password: hashedPassword,
      role: 'admin',
      displayName: 'System Admin'
    });
    await newAdmin.save();
    console.log('Created new admin user!');
    console.log('- Email: admin@trips.com');
    console.log('- Password: adminpassword123');
  }

  await mongoose.disconnect();
  console.log('Disconnected!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
