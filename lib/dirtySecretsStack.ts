import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
} from "aws-cdk-lib/core";
import { Construct } from "constructs";
import {
  Table,
  TableEncryption,
  AttributeType,
  BillingMode,
  CfnTable,
} from "aws-cdk-lib/aws-dynamodb";
import {
  PolicyDocument,
  PolicyStatement,
  Effect,
  CfnRole,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays, LogGroup } from "aws-cdk-lib/aws-logs";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  Alias,
  Architecture,
  Runtime,
  FunctionUrlAuthType,
} from "aws-cdk-lib/aws-lambda";

export class DirtySecretsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const tableName = "dirty-secrets";
    const stack = Stack.of(this);
    const region = stack.region;
    const account = stack.account;
    const secretsDDB = new Table(this, "SecretsTable", {
      tableName,
      partitionKey: { name: "principal", type: AttributeType.STRING },
      sortKey: { name: "name", type: AttributeType.STRING },
      encryption: TableEncryption.AWS_MANAGED,
      billingMode: BillingMode.PAY_PER_REQUEST,
      resourcePolicy: PolicyDocument.fromJson({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "DenyAllButLambdaRole",
            Effect: "Deny",
            Principal: "*",
            Action: [
              "dynamodb:GetItem",
              "dynamodb:Query",
              "dynamodb:BatchGetItem",
            ],
            Resource: [
              `arn:aws:dynamodb:${region}:${account}:table/${tableName}`,
              `arn:aws:dynamodb:${region}:${account}:table/${tableName}/*`,
            ],
            Condition: {
              "ForAllValues:StringNotEquals": {
                "dynamodb:LeadingKeys": ["${aws:PrincipalArn}"],
              },
            },
          },
          {
            Sid: "DenyExfiltration",
            Effect: "Deny",
            Principal: "*",
            Action: ["dynamodb:Scan"],
            Resource: [
              `arn:aws:dynamodb:${region}:${account}:table/${tableName}`,
              `arn:aws:dynamodb:${region}:${account}:table/${tableName}/*`,
            ],
          },
        ],
      }),
    });

    const cfnDDB = secretsDDB.node.defaultChild as CfnTable;
    cfnDDB.overrideLogicalId("SecretsDDBTable");

    const functionName = "dirty-secrets-function";
    const logGroup = new LogGroup(this, "LogGroup", {
      retention: RetentionDays.ONE_DAY,
      logGroupName: `/aws/lambda/${functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const dirtySecretsFunction = new NodejsFunction(
      this,
      "DirtySecretsFunction",
      {
        entry: "src/handler.mjs",
        description:
          "Function to illustrate using DynamoDB as a Secrets Manager",
        functionName: "dirty-secrets-function",
        runtime: Runtime.NODEJS_20_X,
        architecture: Architecture.ARM_64,
        timeout: Duration.seconds(3),
        logGroup,
        bundling: {
          format: OutputFormat.ESM,
          mainFields: ["module", "main"],
          bundleAwsSDK: true,
          minify: false,
          metafile: false,
          // rip out non-essential credential provider stuff
          externalModules: [
            "@aws-sdk/client-sso",
            "@aws-sdk/client-sso-oidc",
            "@smithy/credential-provider-imds",
            "@aws-sdk/credential-provider-ini",
            "@aws-sdk/credential-provider-http",
            "@aws-sdk/credential-provider-process",
            "@aws-sdk/credential-provider-sso",
            "@aws-sdk/credential-provider-web-identity",
            "@aws-sdk/token-providers",
          ],
        },
      }
    );

    dirtySecretsFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["dynamodb:GetItem"],
        resources: [secretsDDB.tableArn],
        conditions: {
          "ForAllValues:StringEquals": {
            "dynamodb:LeadingKeys": [dirtySecretsFunction.role?.roleArn],
          },
        },
      })
    );

    // set lambda role name
    let cfnLambdaRole = dirtySecretsFunction.role?.node.defaultChild as CfnRole;
    cfnLambdaRole.overrideLogicalId("DirtySecretsFunctionRole");
    cfnLambdaRole.addPropertyOverride(
      "RoleName",
      `${functionName}-lambda-role`
    );

    // add an alias to the lambda function
    const alias = new Alias(this, "FunctionAlias", {
      aliasName: "dev",
      version: dirtySecretsFunction.currentVersion,
    });

    let url = alias.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    // Output the URL of the Lambda Function
    new CfnOutput(this, "FunctionUrl", {
      value: url.url,
      description: "The URL of the Lambda Function",
    });

    new CfnOutput(this, "DDBCreateItemUrl", {
      value: `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#edit-item?itemMode=1&route=ROUTE_ITEM_EXPLORER&table=${tableName}`,
      description: "The URL to add secrets to the DynamoDB Table",
    });

    new CfnOutput(this, "CLIGetItemCommand", {
      value: `aws dynamodb get-item --key '{"partition":{"S":"${dirtySecretsFunction.role?.roleArn}"},"name": {"S":"secret"}}' --table-name ${tableName}`,
      description:
        "The CLI command to run to attempt to get a secret from the table, it will fail",
    });

    new CfnOutput(this, "FunctionPrincipal", {
      value: `${dirtySecretsFunction.role?.roleArn}`,
      description:
        "The function principal to use when putting secrets in the table",
    });
  }
}
