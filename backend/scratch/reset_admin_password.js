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

  // Reset admin@gmail.com password
  const newPassword = 'admin123';
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  const admin = await User.findOne({ email: 'admin@gmail.com' });
  if (admin) {
    admin.password = hashedPassword;
    admin.role = 'admin'; // Double-ensure role is admin
    await admin.save();
    console.log('Successfully reset admin@gmail.com password!');
    console.log(`- Username/Email: admin@gmail.com`);
    console.log(`- Password: ${newPassword}`);
  } else {
    console.log('admin@gmail.com not found. Let\'s create it!');
    const newAdmin = new User({
      email: 'admin@gmail.com',
      password: hashedPassword,
      role: 'admin',
      displayName: 'System Admin'
    });
    await newAdmin.save();
    console.log('Created and set admin@gmail.com!');
    console.log(`- Username/Email: admin@gmail.com`);
    console.log(`- Password: ${newPassword}`);
  }

  await mongoose.disconnect();
  console.log('Disconnected!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
