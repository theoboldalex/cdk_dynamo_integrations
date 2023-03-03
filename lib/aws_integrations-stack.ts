import * as cdk from 'aws-cdk-lib';
import { AwsIntegration, Cors, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class AwsIntegrationsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const api = new RestApi(this, 'apigw-api', {
            restApiName: 'Alexs Rest API',
            defaultCorsPreflightOptions: {
                allowOrigins: Cors.ALL_ORIGINS
            }
        });

        const table = new Table(this, 'dynamoTable', {
            partitionKey: {
                name: '__pk',
                type: AttributeType.NUMBER
            },
            tableName: 'family-members',
            billingMode: BillingMode.PAY_PER_REQUEST
        });

        const scanPolicy = new Policy(this, 'getPolicy', {
            statements: [
                new PolicyStatement({
                    actions: ['dynamodb:Scan'],
                    effect: Effect.ALLOW,
                    resources: [table.tableArn],
                }),
            ],
        });

        const scanRole = new Role(this, 'scanRole', {
            assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
        });

        scanRole.attachInlinePolicy(scanPolicy);

        const errorResponses = [
            {
                selectionPattern: '400',
                statusCode: '400',
                responseTemplates: {
                    'application/json': `{
                        "error": "Shoddy input!"
                    }`,
                },
            },
            {
                selectionPattern: '5\\d{2}',
                statusCode: '500',
                responseTemplates: {
                    'application/json': `{
                        "error": "Internal Service Error!"
                    }`,
                },
            },
        ];

        const integrationResponses = [
            {
                statusCode: '200',
            },
            ...errorResponses,
        ];

        const scanRequest = new AwsIntegration({
            action: 'Scan',
            options: {
                credentialsRole: scanRole,
                integrationResponses: integrationResponses,
                requestTemplates: {
                    'application/json': `{
                        "TableName": "${table.tableName}"
                    }`
                }
            },
            service: 'dynamodb'
        });

        const methodOptions = { 
            methodResponses: [
                { statusCode: '200' },
                { statusCode: '400' },
                { statusCode: '500' }
            ]
        };

        api.root.addResource('family')
            .addMethod('GET', scanRequest, methodOptions);
    }
}
