"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

// Create a new VPC
const vpc = new aws.ec2.Vpc("my-vpc", {
    cidrBlock: "10.0.0.0/16",
    tags: {
        Name: "MyVPC",
    },
});

// Create public and private subnets in different availability zones
const availabilityZones = ["us-east-2a", "us-east-2b", "us-east-2c"];

const publicSubnets = [];
const privateSubnets = [];

for (let i = 0; i < availabilityZones.length; i++) {
    const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
        cidrBlock: `10.0.${i}.0/24`,
        availabilityZone: availabilityZones[i],
        vpcId: vpc.id,
        mapPublicIpOnLaunch: true,
        tags: {
            Name: `PublicSubnet-${i}`,
        },
    });

    publicSubnets.push(publicSubnet.id);

    const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
        cidrBlock: `10.0.${i + 3}.0/24`,
        availabilityZone: availabilityZones[i],
        vpcId: vpc.id,
        tags: {
            Name: `PrivateSubnet-${i}`,
        },
    });

    privateSubnets.push(privateSubnet.id);
}

// Create an Internet Gateway and attach it to the VPC
const internetGateway = new aws.ec2.InternetGateway("internet-gateway", {
    vpcId: vpc.id,
    tags: {
        Name: "MyInternetGateway",
    },
});

// Create a public route table and associate it with the public subnets
const publicRouteTable = new aws.ec2.RouteTable("public-route-table", {
    vpcId: vpc.id,
    tags: {
        Name: "PublicRouteTable",
    },
    routes: [{
        cidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
    }],
});

for (let i = 0; i < publicSubnets.length; i++) {
    const subnetAssociation = new aws.ec2.RouteTableAssociation(`public-subnet-association-${i}`, {
        routeTableId: publicRouteTable.id,
        subnetId: publicSubnets[i],
    });
}

// Create a private route table and associate it with the private subnets
const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
    vpcId: vpc.id,
    tags: {
        Name: "PrivateRouteTable",
    },
});

for (let i = 0; i < privateSubnets.length; i++) {
    const subnetAssociation = new aws.ec2.RouteTableAssociation(`private-subnet-association-${i}`, {
        routeTableId: privateRouteTable.id,
        subnetId: privateSubnets[i],
    });
}

// Export the VPC ID and the IDs of public and private route tables
exports.vpcId = vpc.id;
exports.publicRouteTableId = publicRouteTable.id;
exports.privateRouteTableId = privateRouteTable.id;
