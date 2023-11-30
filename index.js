const pulumi = require('@pulumi/pulumi');

const aws = require('@pulumi/aws');

const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();

const envFilePath = "/home/webappuser/webapp/.env";

var vpcCIDR = config.require('cidrBlock');

const publicCidrBlock = config.require('publicCidrBlock');

const tags = config.getObject('tags');

const amiOwner = config.require('amiOwner');

const amiName = config.require('amiName');

const hostedZoneId = config.require('hostedZoneId');

const domainName = config.require('domainName');

const keypairName = config.require('keypairName');

const rdsUsername = config.require('rdsUsername');

const rdsPassword = config.require('rdsPassword');

const rdsdbName = config.require('rdsdbName');

const ArecordofDNS = "A";

const gcpGoogleProject = config.require('project');
const awsSenderEmailAddress = config.require('awsSenderEmailAddress');
const awsccEmailAddress = config.require('awsccEmailAddress');
const awsSESSMTPPassword = config.require('awsSESSMTPPassword');
const awsSESSMTPUser = config.require('awsSESSMTPUser');
const awsSESSMTPhost = config.require('awsSESSMTPhost');
const gcpBucketRegion = config.require("gcpBucketRegion");
const awsSNSRegion = config.require("awsSNSRegion");

// Create an SNS topic
const mySNStopic = new aws.sns.Topic("mySNStopic");

// Create a Google Cloud Storage bucket
const bucket = new gcp.storage.Bucket("my-gcs-bucket", {
    location: gcpBucketRegion,
});

// Create a Google Cloud Service Account
const gcsServiceAccount = new gcp.serviceaccount.Account("gcsServiceAccount", {
    accountId: "gcsserviceaccountid",
    displayName: "My GCS Service Account",
});


// IAM BINDING
// Grant `storage.objectCreator` role to the service account for the bucket
// const bucketIAMBinding = new gcp.storage.BucketIAMBinding("bucketIAMBinding", {
//     bucket: bucket.name,
//     members: [pulumi.interpolate`serviceAccount:${gcsServiceAccount.email}`],
//     role: "roles/storage.objectCreator",
// });

// TRACK DETAILS IN IAM BINDING
const roles = ["roles/storage.admin"];

for (const role of roles) {
    const serviceIAMBinding = new gcp.projects.IAMMember(`myServiceAccountBinding-${role}`, {
        role: role,
        member: gcsServiceAccount.email.apply(email => `serviceAccount:${email}`),
        project: gcpGoogleProject,
    });
}

// Create access keys for the Google Service Account
const gcsServiceAccountKey = new gcp.serviceaccount.Key("gcsServiceAccountKey", {
    serviceAccountId: gcsServiceAccount.name,
});

const ec2Role = new aws.iam.Role("EC2Role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    Service: "ec2.amazonaws.com",
                },
            },
        ],
    }),
});

const myIamLambdaRole = new aws.iam.Role("myIamLambdaRole", {
    name:"myIamLambdaRole",
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "lambda.amazonaws.com",
            },
        }
        ],
    })
});

const cloudWatchPolicy = new aws.iam.Policy("CloudWatchPolicy", {
    name: "CloudWatchPolicy",
    description: "Policy for CloudWatch and EC2 permissions",
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "cloudwatch:PutMetricData",
                    "ec2:DescribeVolumes",
                    "ec2:DescribeTags",
                    "logs:PutLogEvents",
                    "logs:DescribeLogStreams",
                    "logs:DescribeLogGroups",
                    "logs:CreateLogStream",
                    "logs:CreateLogGroup",
                ],
                Resource: "*",
            },
            {
                Effect: "Allow",
                Action: ["ssm:GetParameter"],
                Resource: "arn:aws:ssm:::parameter/AmazonCloudWatch-*",
            },
        ],
    },
});

const snsAccessForEC2 = new aws.iam.RolePolicyAttachment("SNS ACCESS POLICY", {
    role: ec2Role.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
});

const cloudWatchPolicyAttachment = new aws.iam.PolicyAttachment("CloudWatchPolicyAttachment", {
    policyArn: cloudWatchPolicy.arn,
    roles: [ec2Role.name],
});

const lambdaDynamoDBPolicyAttachment = new aws.iam.PolicyAttachment("lambdaDynamoDBPolicyAttachment", {
    policyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
    roles: [myIamLambdaRole.name],
});

const instanceProfile = new aws.iam.InstanceProfile("EC2InstanceProfile", {
    name: "EC2InstanceProfile",
    role: ec2Role.name,
});

const debianAmi = aws.ec2.getAmi({



    mostRecent: true,

    filters: [

        {

            name: "name",

            values: [amiName],

        },

        {

            name: "virtualization-type",

            values: ["hvm"],

        },

    ],

    owners: [amiOwner],

});



aws.getAvailabilityZones({ State: "available" }).then(availableZones => {

    const availabilityZones = availableZones.names.slice(0, 3);

    const vpc = new aws.ec2.Vpc('my-vpc', {

        cidrBlock: vpcCIDR,

        enableDnsSupport: true,

        enableDnsHostnames: true,

        tags: {

            "Name": "VPC CREATED FROM SCRIPT"

        }

    });


    const internetGw = new aws.ec2.InternetGateway("internetGw", {

        vpcId: vpc.id,

        tags: {

            Name: "createdGateway",

        },

    });


    const publicRouteTable = new aws.ec2.RouteTable('publicRouteTable', {

        vpcId: vpc.id,

        routes: [

            {

                cidrBlock: publicCidrBlock,

                gatewayId: internetGw.id,

            }],

        tags: {

            "Name": "PublicRouteTable"

        },

    });


    const privateRouteTable = new aws.ec2.RouteTable('privateRouteTable', {

        vpcId: vpc.id,

        tags: {

            "Name": "PrivateRouteTable"

        },

    });



    console.log(availabilityZones);


    var i = 1;

    const publicSubnets = [];

    const privateSubnets = [];



    availabilityZones.forEach((az, index) => {



        const thirdOctet = index + 1;

        const publicSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${thirdOctet}.0/24`;

        const privateSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${(parseInt(thirdOctet) * 10)}.0/24`;

        console.log(publicSubnetCIDR, privateSubnetCIDR)

        const publicSubnet = new aws.ec2.Subnet(`public-subnet-${az}`, {

            vpcId: vpc.id,

            cidrBlock: publicSubnetCIDR,

            availabilityZone: az,

            mapPublicIpOnLaunch: true,

            tags: {

                "Name": `publicSubnet-${i}`

            },

        });



        const publicRouteTableAssociation = new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${az}`, {

            subnetId: publicSubnet.id,

            routeTableId: publicRouteTable.id,

        });



        const privateSubnet = new aws.ec2.Subnet(`private-subnet-${az}`, {

            vpcId: vpc.id,

            cidrBlock: privateSubnetCIDR,

            availabilityZone: az,

            tags: {

                "Name": `privateSubnet-${i}`

            },

        });



        const privateRouteTableAssociation = new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${az}`, {

            subnetId: privateSubnet.id,

            routeTableId: privateRouteTable.id,

        });



        publicSubnets.push(publicSubnet.id);

        privateSubnets.push(privateSubnet.id);

        i = i + 1;

    });



    // Security Group Creation for Ec2 Instance

    // Load Balancer Subnet Group
    const LoadBalancerSecurityGroup = new aws.ec2.SecurityGroup('LoadBalancerSecurityGroup', {

        vpcId: vpc.id,
        description: "Load Balancer Security Group",

        ingress: [

            {

                protocol: "tcp",

                fromPort: 80,

                toPort: 80,

                cidrBlocks: ["0.0.0.0/0"],

            },

            {

                protocol: "tcp",

                fromPort: 443,

                toPort: 443,

                cidrBlocks: ["0.0.0.0/0"],

            },

        ],

        egress: [
            {

                protocol: "tcp",

                fromPort: 8087, //APPLICATION RUNS ON THIS PORT

                toPort: 8087,

                cidrBlocks: ["0.0.0.0/0"],

            },
        ],

        tags: {

            "Name": "Load Balancer Security Group"

        },

    });

    //console.log(publicSubnets, privateSubnets)
    const MyApplicationSecurityGroup = new aws.ec2.SecurityGroup('MyApplicationSecurityGroup', {

        vpcId: vpc.id,
        description: "Application Security Group",

        ingress: [

            {

                protocol: "tcp",

                fromPort: 22,

                toPort: 22,

                // securityGroups:[LoadBalancerSecurityGroup.id],
                cidrBlocks: ["0.0.0.0/0"],
            },

            {

                protocol: "tcp",

                fromPort: 8087,

                toPort: 8087,

                securityGroups: [LoadBalancerSecurityGroup.id],

            },

        ],

        egress: [
            {
                fromPort: 0,
                toPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"], // Restrict egress traffic to the internet
            },
        ],
        tags: {

            "Name": "Application Security Group"

        },

    });


    // RDS Parameter Group
    const rdsParameterGroup = new aws.rds.ParameterGroup("rds_parameter_group", {
        name: "rds-parameter-group",
        family: "mysql8.0",
        description: "RDS DB parameter group for MySQL 8.0",
        parameters: [
            {
                name: "max_connections",
                value: "100",
            },
            {
                name: "innodb_buffer_pool_size",
                value: "268435456",
            },
        ],
    });



    // RDS Subnet Group
    const rdsSubnetGroup = new aws.rds.SubnetGroup("rdssubnetgroup-sg", {
        name: "rds-subnet-group",
        subnetIds: [
            privateSubnets[0],
            privateSubnets[1],
        ],
        description: "Subnet group for the RDS instance",
    });

    //RDS Security Group
    const dbSecurityGroup = new aws.ec2.SecurityGroup("dbSecurityGroup", {
        vpcId: vpc.id,
        description: "Database Security Group",
        ingress: [{
            fromPort: 3306,   // MySQL/MariaDB port
            toPort: 3306,
            protocol: "tcp",
            securityGroups: [MyApplicationSecurityGroup.id]
            // Assuming you have an 'applicationSecurityGroup' defined
        },
        ],
        egress: [
            {
                from_port: 3306,
                to_port: 3306,
                protocol: "tcp",
                securityGroups: [MyApplicationSecurityGroup.id]
                //cidr_blocks = ["0.0.0.0/0"]
            },
        ],
    });

    //RDS Instance 
    const rdsInstance = new aws.rds.Instance('MydatabaseRdsInstance', {
        allocatedStorage: 20,
        storageType: 'gp2',
        engine: 'mysql',
        instanceClass: 'db.t2.micro', // Use the cheapest one
        identifier: "csye6225",
        dbName: rdsdbName,
        username: rdsUsername,
        password: rdsPassword,
        multiAz: false,
        parameterGroupName: rdsParameterGroup.name,
        skipFinalSnapshot: true, // Adjust this based on your needs
        vpcSecurityGroupIds: [dbSecurityGroup.id],
        dbSubnetGroupName: rdsSubnetGroup.name,
        publiclyAccessible: false,
    });

    const webappUserData = pulumi.all([rdsInstance.endpoint, rdsInstance.username, rdsInstance.password, rdsInstance.dbName, mySNStopic.arn, awsSNSRegion])
        .apply(([endpoint, username, password, dbName,topicsnsARN,region]) => {
            return `#!/bin/bash
        rm "${envFilePath}"

        echo "DB_HOST=\$(echo ${endpoint} | cut -d':' -f1)" >> ${envFilePath}
        echo "DB_DIALECT=mysql" >> ${envFilePath}
        echo "DB_USER=${username}" >> ${envFilePath}
        echo "DB_PASSWORD=${password}" >> ${envFilePath}
        echo "DB_DATABASE=${dbName}" >> ${envFilePath}
        echo "ARNSNSTOPIC=${topicsnsARN}" >> ${envFilePath}
        echo "AWS_SNS_REGION=${region}" >> ${envFilePath}
        echo "PORT=8087" >> ${envFilePath}
        sudo systemctl restart webapp
        sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/amazon-cloud-watch-agent.json`;
        });

    const base64UserData = webappUserData.apply(data => Buffer.from(data).toString('base64'));


    // User Data 

    const launchTemplate = new aws.ec2.LaunchTemplate("asg_launch_config", {
        imageId: debianAmi.then(ami => ami.id),
        instanceType: "t2.micro",
        name: "asg_launch_config",
        keyName: keypairName,
        networkInterfaces: [{
            associatePublicIpAddress: true,
            securityGroups: [MyApplicationSecurityGroup.id],
        }],
        userData: base64UserData,
        iamInstanceProfile: { name: instanceProfile.name },
        blockDeviceMappings: [{
            deviceName: "/dev/xvda",
            ebs: { volumeSize: 20, deleteOnTermination: true, volumeType: "gp2" },
        }],
    });

    const applbTargetGroup = new aws.lb.TargetGroup("applbTargetGroup", {
        port: 8087,
        protocol: "HTTP",
        targetType: "instance",
        healthCheck: {
            path: "/healthz",
            port: "traffic-port",
        },
        vpcId: vpc.id, // Your VPC's ID
    });

    const autoScalingGroup = new aws.autoscaling.Group("autoScalingGroup", {
        name: "auto-scaling-group",
        targetGroupArns: [applbTargetGroup.arn],
        vpcZoneIdentifiers: [publicSubnets[0], publicSubnets[1], publicSubnets[2]],
        cooldown: 60,
        launchTemplate: {
            id: launchTemplate.id,
            version: launchTemplate.latestVersion,
        },
        minSize: 1,
        maxSize: 3,
        desiredCapacity: 1,
        tags: [
            { key: "AutoScalingGroup", value: "TagProperty", propagateAtLaunch: true },
        ],
    });

    const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
        name: "scale-up-policy",
        autoscalingGroupName: autoScalingGroup.name,
        adjustmentType: "ChangeInCapacity",
        scalingAdjustment: 1, // Increment by 1
        cooldown: 60,
        policyType: "SimpleScaling",
        metricAggregationType: "Average",
    });

    const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
        name: "scale-down-policy",
        autoscalingGroupName: autoScalingGroup.name,
        adjustmentType: "ChangeInCapacity",
        scalingAdjustment: -1, // Decrement by 1
        cooldown: 60,
        policyType: "SimpleScaling",
        metricAggregationType: "Average",

    });

    const scaleUpAlarm = new aws.cloudwatch.MetricAlarm("scaleUpAlarm", {
        alarmName: "scale_up_alarm",
        alarmDescription: "Scale up when average CPU usage is above 5%",
        comparisonOperator: "GreaterThanOrEqualToThreshold",
        evaluationPeriods: 1,
        metricName: "CPUUtilization",
        namespace: "AWS/EC2",
        period: 60, // 1 minute period
        threshold: 5,
        statistic: "Average",
        dimensions: {
            AutoScalingGroupName: autoScalingGroup.name,
        },
        actionsEnabled: true,
        alarmActions: [scaleUpPolicy.arn], // Assuming you have scaleUpPolicy defined earlier
    });

    const scaleDownAlarm = new aws.cloudwatch.MetricAlarm("scaleDownAlarm", {
        alarmName: "scale_down_alarm",
        alarmDescription: "Scale down when average CPU usage is below 3%",
        comparisonOperator: "LessThanOrEqualToThreshold",
        evaluationPeriods: 1,
        metricName: "CPUUtilization",
        namespace: "AWS/EC2",
        period: 60, // 1 minute period
        threshold: 3,
        statistic: "Average",
        dimensions: {
            AutoScalingGroupName: autoScalingGroup.name,
        },
        actionsEnabled: true,
        alarmActions: [scaleDownPolicy.arn], // Assuming you have scaleDownPolicy defined earlier
    });

    const appLoadBalancer = new aws.lb.LoadBalancer("appLoadBalancer", {
        name: "app-load-balancer",
        internal: false,
        loadBalancerType: "application",
        securityGroups: [LoadBalancerSecurityGroup.id],
        subnets: publicSubnets,
        tags: {
            Name: "web application LoadBalancer",
        },
    });

    const appLoadBalancerListener = new aws.lb.Listener("appLoadBalancerListener", {

        //the Load Balancer Amazon Resource Name (ARN) is a unique identifier
        loadBalancerArn: appLoadBalancer.arn,
        port: 80,
        defaultActions: [{
            type: "forward",

            // the Application Load Balancer Target Group Amazon Resource Name (ARN) is a unique identifier
            targetGroupArn: applbTargetGroup.arn,
        }],
    });

    const appLoadBalancerRecord = new aws.route53.Record("appLoadBalancerRecord", {
        name: "",
        type: ArecordofDNS,
        aliases: [{
            name: appLoadBalancer.dnsName,
            zoneId: appLoadBalancer.zoneId,
            evaluateTargetHealth: true,
        }],
        zoneId: hostedZoneId, // replace with your hosted zone id
    });


    // Create a DynamoDB instance for use for lambda function
    const dynamoDbTable = new aws.dynamodb.Table("lambdainstancetable", {
        attributes: [{
            name: "id",
            type: "S",
        }],
        hashKey: "id",
        //amount of data that your application can read from or write to the DynamoDB table per second
        readCapacity: 5,
        writeCapacity: 5,
    });

    // // Attach Policy to IAM Role
    // const myLambdaPolicy = new aws.iam.Policy("myLambdaPolicy", {
    //     policy: {
    //         Version: "2012-10-17",
    //         Statement: [
    //             {
    //                 Effect: "Allow",
    //                 Action: "logs:*",
    //                 Resource: "*",
    //             },
    //             // {
    //             //     Effect: "Allow",
    //             //     Action: "dynamodb:*",
    //             //     Resource: dynamoDbTable.arn,
    //             // },
    //             {
    //                 Effect: "Allow",
    //                 Action: "lambda:*",
    //                 Resource: "*"
    //             }
    //             // Add SNS permissions
    //             // {
    //             //     Effect: "Allow",
    //             //     Action: "sns:*",
    //             //     Resource: mySNStopic.arn,
    //             // },
    //             // Add other permissions as needed
    //         ],
    //     },
    // });

    // Attach the AWSLambdaBasicExecutionRole managed policy to the Lambda role
    const myLambdaRoleAttachment = new aws.iam.RolePolicyAttachment("myLambdaRoleAttachment", {
        policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        role: myIamLambdaRole,
    });

    // Create Lambda Function and configure with Google Access Keys and bucket name
    const myLambdaFunction = new aws.lambda.Function("myLambdaFunction", {
        code: new pulumi.asset.AssetArchive(
            {
                "": new pulumi.asset.FileArchive("/Users/manishkandukuri/serverless"),
            }),
        name: "LambdaFunction",
        role: myIamLambdaRole.arn,
        handler: "index.handler",
        runtime: "nodejs18.x",
        environment: {
            variables: {
                GOOGLE_PRIVATE_KEY: gcsServiceAccountKey.privateKey,
                GOOGLE_BUCKET_NAME: bucket.name,
                GOOGLE_PROJECTID: gcpGoogleProject,
                //GITHUB_TOKEN: githubToken,
                EMAIL_SMTP_HOST: awsSESSMTPhost, // Change to your SES SMTP server
                EMAIL_SMTP_USERNAME: awsSESSMTPUser, // Use your AWS access key ID
                EMAIL_SMTP_PASSWORD: awsSESSMTPPassword, // Use your AWS secret access key
                EMAIL_SMTP_PORT: "465",
                EMAIL_SENDER_EMAIL: awsSenderEmailAddress,
                CCEMAILLIST: awsccEmailAddress,
                AWS_STORAGE_REGION: awsSNSRegion,
                DYNAMO_DBTABLE: dynamoDbTable.name

                //necessary persmsiions 
            }

        },
    });

    // Create a subscription to connect the SNS topic to the Lambda function
    const lambdaSubscription = new aws.sns.TopicSubscription("lambdaSubscription", {
        topic: mySNStopic.arn,
        protocol: "lambda",
        endpoint: myLambdaFunction.arn,
    });

    // Create a Lambda permission to allow the SNS topic to trigger the Lambda function
    const lambdaSnsPermission = new aws.lambda.Permission("lambdaSnsPermission", {
        action: "lambda:InvokeFunction",
        function: myLambdaFunction.arn,
        principal: "sns.amazonaws.com",
        sourceArn: mySNStopic.arn,
    });

    // Publish a message to the SNS topic
    const snsTopicPublication = new aws.sns.TopicPolicy("snsTopicPublication", {
        arn: mySNStopic.arn,
        policy: mySNStopic.arn.apply(arn => JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: "SNS:Publish",
                Effect: "Allow",
                Principal: "*",
                Resource: arn,
            }],
        })),
    });
    exports.myLambdaFunctionArn = myLambdaFunction.arn;

});
exports.roleName = ec2Role.name;
exports.topicArn = mySNStopic.arn;



