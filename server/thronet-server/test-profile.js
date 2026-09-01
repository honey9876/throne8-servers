import axios from 'axios';
async function run() {
  try {
    const res = await axios.get('http://localhost:4000/api/v1/auth/get-user/3cd22124-ff4b-4c5a-983c-a910bf9a6987');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
run();
