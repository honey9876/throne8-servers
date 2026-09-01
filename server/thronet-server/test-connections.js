import axios from 'axios';
async function run() {
  try {
    const res = await axios.post('http://localhost:4000/api/v1/auth/login', {
      email: 'rishab@gmail.com',
      password: 'Rishab@213'
    });
    const token = res.data.data.tokens.accessToken;
    const userId = res.data.data.user.userId;
    
    console.log("Connections:");
    const connRes = await axios.get(`http://localhost:4000/api/v1/connections/connection/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(Object.keys(connRes.data.data));
    if (!Array.isArray(connRes.data.data)) {
        console.log('Is not array, has .data?', Array.isArray(connRes.data.data.data));
    }
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
run();
