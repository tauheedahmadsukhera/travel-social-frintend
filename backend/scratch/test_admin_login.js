const axios = require('axios');

async function main() {
  try {
    const res = await axios.post('http://localhost:5002/api/admin/login', {
      email: 'admin@gmail.com',
      password: 'admin123'
    });
    console.log('Login request SUCCESS!');
    console.log('Response:', res.data);
  } catch (err) {
    console.error('Login request FAILED!');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Error Data:', err.response.data);
    } else {
      console.error('Error Message:', err.message);
    }
  }
}

main();
