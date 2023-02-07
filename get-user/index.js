const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-2' });

const ddb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  console.log('Received context:', JSON.stringify(context, null, 2));

  const body = JSON.parse(event.body);
  const uniqueId = body.uniqueId;

  const uniqueIdStatement = `SELECT * FROM "users" where uniqueId = '${uniqueId}';`;

  const user = await ddb.executeStatement({ Statement: uniqueIdStatement }).promise();

  if (user.Items.length === 0) {
    // user with selected uniqueId does not exist.
    return {
      user: null,
    };
  } else {
    // user with selected uniqueId exists. Return user
    console.log('result is: 👉️', user.Items[0]);
    return {
      user: user.Items[0],
    };
  }
};