const axios = require('axios');

async function main() {
  try {
    const res = await axios.get('http://localhost:5002/api/admin/categories');
    console.log('Backend Port 5002 is ACTIVE!');
    console.log('Response Status:', res.status);
  } catch (err) {
    console.error('Cannot connect to port 5002:', err.message);
  }
}

main();
