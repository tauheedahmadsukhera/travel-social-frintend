// ✅ API TESTING SCRIPT - Test all critical endpoints
import apiService from './app/services/apiService';

const testAPI = async () => {
  console.log('🚀 Starting API Tests...\n');

  try {
    // Test 1: Backend Status
    console.log('📡 Testing Backend Status...');
    const status = await apiService.checkStatus();
    console.log('✅ Status:', status);

    // Test 2: Health Check
    console.log('\n🏥 Testing Health Check...');
    const health = await apiService.checkHealth();
    console.log('✅ Health:', health);

    // Test 3: Get Posts
    console.log('\n📱 Testing Get Posts...');
    const posts = await apiService.getPosts({ limit: 5 });
    console.log('✅ Posts count:', posts?.data?.length || 0);

    // Test 4: Get Categories
    console.log('\n📂 Testing Get Categories...');
    const categories = await apiService.getCategories();
    console.log('✅ Categories count:', categories?.data?.length || 0);

    // Test 5: Get Location Count
    console.log('\n🗺️ Testing Location Count...');
    const locations = await apiService.getLocationCount();
    console.log('✅ Locations:', locations?.data?.length || 0);

    // Test 6: Get Live Streams
    console.log('\n📺 Testing Live Streams...');
    const streams = await apiService.getLiveStreams();
    console.log('✅ Live streams count:', streams?.data?.length || 0);

    console.log('\n🎉 All API tests completed successfully!');
    
  } catch (error) {
    console.error('❌ API Test Failed:', error.message);
    console.error('Full Error:', error);
  }
};

// Run tests
testAPI();