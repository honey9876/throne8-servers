import axios from 'axios';

async function test() {
  try {
    console.log('Logging in...');
    // Login as User B
    const loginRes = await axios.post('http://localhost:4000/api/v1/auth/login', {
      email: 'rishab@gmail.com',
      password: 'Rishab@213'
    });
    
    const token = loginRes.data.data.tokens.accessToken;
    const userId = loginRes.data.data.user.userId;
    console.log('Logged in! User ID:', userId);
    
    console.log('Fetching outgoing requests for', userId, '...');
    const outRes = await axios.get(`http://localhost:4000/api/v1/connections/requests/user/${userId}/outgoing`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('Outgoing requests API response:');
    console.log(JSON.stringify(outRes.data, null, 2));

  } catch (err) {
    if (err.response) {
      console.error('API Error:', err.response.status, JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error:', err.message);
    }
  }
}
test();
