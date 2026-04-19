const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

async function testApi() {
  if (!API_KEY) {
    console.error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (or GOOGLE_MAPS_API_KEY)');
    process.exit(1);
  }

  console.log('Testing Google Maps API Key...');
  
  // Test Geocoding
  try {
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=London&key=${API_KEY}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    console.log('Geocoding Status:', geoData.status);
    if (geoData.error_message) console.log('Error:', geoData.error_message);
  } catch (e) {
    console.error('Geocoding Request Failed:', e.message);
  }

  // Test Places Autocomplete
  try {
    const autoUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Par&key=${API_KEY}`;
    const autoRes = await fetch(autoUrl);
    const autoData = await autoRes.json();
    console.log('Places Autocomplete Status:', autoData.status);
    if (autoData.error_message) console.log('Error:', autoData.error_message);
  } catch (e) {
    console.error('Places Autocomplete Request Failed:', e.message);
  }
}

testApi();
