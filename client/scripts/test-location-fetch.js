// Test location data fetching using the Google API Key
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

async function testLocationFetch() {
  console.log('Using API Key:', API_KEY.substring(0, 10) + '...');
  
  // 1. Geocoding Test (Address to Coordinates)
  const address = 'New York City';
  console.log(`\n1. Geocoding address: "${address}"...`);
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`);
    const data = await res.json();
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const { lat, lng } = result.geometry.location;
      console.log('✅ Geocoding Success!');
      console.log(`   Formatted Address: ${result.formatted_address}`);
      console.log(`   Coordinates: Latitude = ${lat}, Longitude = ${lng}`);
      
      // Let's use these coordinates for reverse geocoding
      await testReverseGeocode(lat, lng);
    } else {
      console.error('❌ Geocoding failed. Status:', data.status, data.error_message || '');
    }
  } catch (e) {
    console.error('❌ Geocoding exception:', e.message);
  }

  // 2. Autocomplete Places Test
  const query = 'Tokyo Tower';
  console.log(`\n3. Autocomplete Places for query: "${query}"...`);
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${API_KEY}&language=en`);
    const data = await res.json();
    if (data.status === 'OK' && data.predictions && data.predictions.length > 0) {
      console.log('✅ Autocomplete Success! Top 3 predictions:');
      data.predictions.slice(0, 3).forEach((pred, index) => {
        console.log(`   [${index + 1}] ${pred.description} (Place ID: ${pred.place_id})`);
      });
    } else {
      console.error('❌ Autocomplete failed. Status:', data.status, data.error_message || '');
    }
  } catch (e) {
    console.error('❌ Autocomplete exception:', e.message);
  }
}

async function testReverseGeocode(lat, lng) {
  console.log(`\n2. Reverse geocoding coordinates: ${lat}, ${lng}...`);
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`);
    const data = await res.json();
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      console.log('✅ Reverse Geocoding Success!');
      console.log(`   Formatted Address: ${result.formatted_address}`);
      
      // Find city and country
      const components = result.addresscomponents || [];
      const city = components.find(c => c.types.includes('locality'))?.long_name;
      const country = components.find(c => c.types.includes('country'))?.long_name;
      console.log(`   City: ${city || 'Not found'}`);
      console.log(`   Country: ${country || 'Not found'}`);
    } else {
      console.error('❌ Reverse geocoding failed. Status:', data.status, data.error_message || '');
    }
  } catch (e) {
    console.error('❌ Reverse geocoding exception:', e.message);
  }
}

testLocationFetch();
