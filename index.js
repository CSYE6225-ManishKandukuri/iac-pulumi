const pulumi = require('@pulumi/pulumi');

const aws = require('@pulumi/aws');

const ip = require("ip");

const { Address4 } = require('ip-address');

 

const config = new pulumi.Config();



const awsRegion = config.get('aws-region');

var vpcCIDR = config.require('cidrBlock');

const publicCidrBlock = config.require('publicCidrBlock');

const tags = config.getObject('tags');
const keypair= config.require('keyPairName');
const launchAMI = config.require('launchAMIID');

const debianAmi = aws.ec2.getAmi({
    mostRecent: true,
    filters: [
        {
            name: "name",
            values: ["test123-*"],
        },
        {
            name: "virtualization-type",
            values: ["hvm"],
        },
    ],
    owners: ["341182795354"],
});
//10.25.0.0/16
 

//aws.config.region = awsRegion;

 

//aws:profile:

 

console.log(awsRegion,"this is my configured region");

 

aws.getAvailabilityZones({awsRegion}).then(availableZones => {

    const availabilityZones = availableZones.names.slice(0,3);

    const vpc = new aws.ec2.Vpc('my-vpc', {

        cidrBlock: vpcCIDR,

        enableDnsSupport: true,

        enableDnsHostnames: true,

        tags : {

            "Name" : "MyVPC"

        }

    });

    

    const internetGw = new aws.ec2.InternetGateway("internetGw", {

        vpcId: vpc.id,

        tags: {

            Name: "MyGateway",

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

            "Name" : "MyPublicRouteTable"

        },

      });

    

    const privateRouteTable = new aws.ec2.RouteTable('privateRouteTable', {

        vpcId: vpc.id, // Replace with your VPC ID

        tags: {

            "Name" : "MyPrivateRouteTable"

        },

      });

    

    

    console.log(availabilityZones);

    

    var i=1;

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

                "Name" : `publicSubnet-${i}`

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

                "Name" : `privateSubnet-${i}`

            },

        });

    

        const privateRouteTableAssociation = new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${az}`, {

            subnetId: privateSubnet.id,

            routeTableId: privateRouteTable.id,

        });

        // const ec2SecurityGroup = new aws.ec2.SecurityGroup("my-ec2-security-group", {
        //     vpcId: vpc.id, // Use the VPC created earlier
        //     // Configure security group rules for ports 22, 80, 443, and your application port
        //     ingress: [
        //         {
        //             fromPort: 22,
        //             toPort: 22,
        //             protocol: "tcp",
        //             cidrBlocks: ["0.0.0.0/0"],
        //         },
        //         {
        //             fromPort: 80,
        //             toPort: 80,
        //             protocol: "tcp",
        //             cidrBlocks: ["0.0.0.0/0"],
        //         },
        //         // Add rules for port your application runs on
        //     ],
        // });
        

        publicSubnets.push(publicSubnet.id);

        privateSubnets.push(privateSubnet.id);

        i=i+1;

    });

    const ec2SecurityGroup = new aws.ec2.SecurityGroup("my-ec2-security-group", {
        vpcId: vpc.id, // Use the VPC created earlier
        // Configure security group rules for ports 22, 80, 443, and your application port
        ingress: [
            {
                fromPort: 22,
                toPort: 22,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"],
            },
            {
                fromPort: 80,
                toPort: 80,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"],
            },
            {
                fromPort: 8080,
                toPort: 8080,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"],
            },
            {
                fromPort: 443,
                toPort: 443,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"],
            },
            // Add rules for port your application runs on
        ],
    });
    
    const ec2Instance = new aws.ec2.Instance("my-ec2-instance", {
        instanceType: "t2.micro", // Use the desired instance type
        vpc: vpc.id,
        subnetId: publicSubnets[0],
        ami: launchAMI,
        keyName: keypair,
        vpcSecurityGroupIds: [ec2SecurityGroup.id], // Attach the security group
        // ... other EC2 instance settings ...
        rootBlockDevice: {

            volumeSize: 25,

            volumeType: "gp2",
            

            deleteOnTermination: true,

        },
    });
    

    console.log(publicSubnets, privateSubnets)

});