const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-2' });

const ddb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  console.log('Received context:', JSON.stringify(context, null, 2));

  const body = JSON.parse(event.body);
  const address = body.address;
  const uniqueId = body.uniqueId;

  const params = {
    TableName: 'users',
    Item: {
      "uniqueId": {
        "S": `${uniqueId}`
      },
      "wallets": {
        "M": {
          [address]: {
            "S": `${address}`
          }
        }
      }
    }
  }

  console.log(body);
  console.log(params);

  const result = await ddb.putItem(params).promise();

  console.log('result is: 👉️', result);
  return result;
};
