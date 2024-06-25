import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event, context) => {
  const command = new GetCommand({
    TableName: "dirty-secrets",
    Key: {
      principal: `arn:aws:iam::${
        context.invokedFunctionArn.split(":")[4]
      }:role/dirty-secrets-function-lambda-role`,
      name: `secret`,
    },
  });
  let secretRead = false;
  try {
    secretRead = (await docClient.send(command)).Item.value != undefined;
  } catch (e) {
    console.error("Unable to read secret", e);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ secretRead }),
  };
};
