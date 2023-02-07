const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-2' });

const ddb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  console.log('Received context:', JSON.stringify(context, null, 2));

  const body = JSON.parse(event.body);
  console.log(body);

  const updateStatement = `UPDATE "users" SET "wallets"."${body.address}" = '${body.address}' WHERE "uniqueId" = '${body.uniqueId}';`;

  const user = await ddb.executeStatement({ Statement: updateStatement }).promise();

  return {
    user: user
  };
};