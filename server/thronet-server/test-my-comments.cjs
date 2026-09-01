const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:4000/api/v1/profile/activity/comments/my-comments');
    console.log(res.data);
  } catch(e) {
    console.log(e.response ? e.response.data : e.message);
  }
}
test();
