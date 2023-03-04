import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import { AwsIntegration, Cors, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { PolicyTypes } from './types';

export class AwsIntegrationsStack extends cdk.Stack {
    private readonly model: string = 'family';
    private readonly api: RestApi;
    private readonly table: Table;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.api = this.createRestApi();
        this.table = this.createDynamoTable();

        const scanPolicy = this.createPolicy('Scan');
        const getPolicy = this.createPolicy('GetItem');

        const scanRole = new Role(this, 'scanRole', {
            assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
        });

        scanRole.attachInlinePolicy(scanPolicy);

        const getRole = new Role(this, 'getRole', {
            assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
        });

        getRole.attachInlinePolicy(getPolicy);

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
                        "TableName": "${this.table.tableName}"
                    }`
                }
            },
            service: 'dynamodb'
        });

        const getRequest = new AwsIntegration({
            action: 'GetItem',
            options: {
                credentialsRole: getRole,
                integrationResponses: integrationResponses,
                requestTemplates: {
                    'application/json': `{
                        "Key": {
                            "${this.model}-id": {
                                "N": "$method.request.path.id"
                            }
                        },
                        "TableName": "${this.table.tableName}"
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

        const allResources = this.api.root.addResource('family');
        const singleResource = allResources.addResource('{id}');
        allResources.addMethod('GET', scanRequest, methodOptions);
        singleResource.addMethod('GET', getRequest, methodOptions);
    }

    private createRestApi(): RestApi {
        return new RestApi(this, 'ApiGateway', {
            restApiName: `${this.model}-api`,
            defaultCorsPreflightOptions: {
                allowOrigins: Cors.ALL_ORIGINS
            }
        });
    }

    private createDynamoTable(): Table {
        return new Table(this, 'DynamoTable', {
            partitionKey: {
                name: `${this.model}-id`,
                type: AttributeType.NUMBER
            },
            tableName: `${this.model}-table`,
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY
        });

    }

    private createPolicy(type: PolicyTypes): Policy {
        return new Policy(this, `${type}Policy`, {
            statements: [
                new PolicyStatement({
                    actions: [`dynamodb:${type}`],
                    effect: Effect.ALLOW,
                    resources: [this.table.tableArn],
                }),
            ],
        });
    }
}
