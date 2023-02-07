const axios = require('axios');

exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event, null, 2));
  console.log(JSON.stringify(context, null, 2));
  console.log(JSON.stringify(callback, null, 2));
  const MORALIS_API_KEY = 'dgsB15H4L5uqzM6wXmVyOI9bjzXEZ104R0UGTShx8b79dHvLdMBvmG40NwtWuiTw';
  const MORALIS_BASE_URL = 'https://deep-index.moralis.io/api/v2/';
  const address = '0x2f7662cd8e784750e116e44a536278d2b429167e';
  const options = {
    params: {
      chain: '0x38',
      normalizeMetadata: true,
    },
    headers: {
      accept: 'application/json',
      'X-API-Key': MORALIS_API_KEY,
    }
  }

  axios.get(`${MORALIS_BASE_URL}${address}/nft`, options).then((result) => {
    console.log(JSON.stringify(result.data, null, 2));
    callback(null, result.data);
  }).catch((err) => {
    console.log(err);
    callback(err);
  });
};