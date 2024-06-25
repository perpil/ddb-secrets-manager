# Using DynamoDB as a Serverless Secrets Manager

This is the companion repo to this [blog post]().

## Code notes
The [CDK stack](lib/dirtySecretsStack.ts) creates a Dynamo Table with a table resource policy that denies reading the items unless the principal arn matches the leading key on the table.  The table has the following schema:

| Partition Key (principal) | Sort Key (name) | Value (value)
| --- | --- | --- |
|arn:aws:iam::111111111111:role/function-name-1-lambda-role|secret-name-1|secret-value-1|
|arn:aws:iam::111111111111:role/function-name-2-lambda-role|secret-name-1|secret-value-1|
|arn:aws:iam::111111111111:role/function-name-2-lambda-role|secret-name-2|secret-value-2|

This means, only the lambda with function-name-1 can read secret-name-1 under the principal arn:aws:iam::111111111111:role/function-name-1-lambda-role.  Only the lambda with function-name-2 can read secret-name-1 and secret-name-2 under the principal arn:aws:iam::111111111111:role/function-name-2-lambda-role.

The [lambda function](src/handler.mjs) attempts to read the secret from the table and returns a json object indicating whether the secret was successfully read or not.  

For convenience the stack emits a function url to easily test the lambda function from your browser.

## Deploying the stack
`npm install`
`npx cdk deploy`

## Writing a secret
Log into the console to the same account you deployed the stack with a principal that has permissions to write to dynamodb.  Navigate to the url listed under `DirtySecretsStack.DDBCreateItemUrl` in the stack outputs.

1. Set `partition` to the value found in stack outputs called: `DirtySecretsStack.FunctionPrincipal`.
2. Set `name` to `secret`.
3. Click the 'Add new attribute' dropdown.  Click `String` and set the attribute name to `value` and set the value to any string you want.
4. Finally click the `Create item` button on the bottom right.

Now your table will have a secret only readable by the lambda function.

## Verifying you can't read the secret
Using the console, try and read any of the contents of the table using scan or query. All attempts will fail.  You can also try to read it using the CLI.  In the stack outputs, there is a sample command to call GetItem on your table called `DirtySecretsStack.CLIGetItemCommand`.  Run it in your terminal to see that it gets denied.

## Verifying your Lambda can read the secret
Navigate to the url listed under `DirtySecretsStack.FunctionUrl` in the stack outputs.  It should respond with `true` and a status code of `200`.

## Cleaning up
`npx cdk destroy`

## Useful commands
* `npx cdk deploy`       deploy this stack to your default AWS account/region
* `npx cdk diff`         compare deployed stack with current state
* `npx cdk synth`        emits the synthesized CloudFormation template
