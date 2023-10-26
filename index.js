const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');
const config = new pulumi.Config();
let webappUserData='';
const envFilePath = "/home/webappuser/webapp/.env";
 
 
//const awsRegion = config.get('aws-region');
 
var vpcCIDR = config.require('cidrBlock');
const publicCidrBlock = config.require('publicCidrBlock');
const tags = config.getObject('tags');
const amiOwner = config.require('amiOwner');
const amiName = config.require('amiName');
 
    
 
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
 
 
 
aws.getAvailabilityZones({State :"available"}).then(availableZones => {
    const availabilityZones = availableZones.names.slice(0,3);
    const vpc = new aws.ec2.Vpc('my-vpc', {
        cidrBlock: vpcCIDR,
        enableDnsSupport: true,
        enableDnsHostnames: true,
        tags : {
            "Name" : "VPC CREATED FROM SCRIPT"
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
 
            "Name" : "PublicRouteTable"
 
        },
 
      });
   
 
    const privateRouteTable = new aws.ec2.RouteTable('privateRouteTable', {
 
        vpcId: vpc.id, // Replace with your VPC ID
 
        tags: {
 
            "Name" : "PrivateRouteTable"
 
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
 
 
 
        publicSubnets.push(publicSubnet.id);
 
        privateSubnets.push(privateSubnet.id);
 
        i=i+1;
 
    });
 
 
 
    //Creating Security Group for Ec2 Instance
    //console.log(publicSubnets, privateSubnets)
    const MyApplicationSecurityGroup = new aws.ec2.SecurityGroup('MyApplicationSecurityGroup', {
 
        vpcId: vpc.id,
 
        ingress: [
 
            {
 
                protocol: "tcp",
 
                fromPort: 22,
 
                toPort: 22,
 
                cidrBlocks: ["0.0.0.0/0"],
 
            },
 
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
 
            {
 
                protocol: "tcp",
 
                fromPort: 8080, //APP_PORT
 
                toPort: 8080,
 
                cidrBlocks: ["0.0.0.0/0"],
 
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
            securityGroups:[MyApplicationSecurityGroup.id]
             // Assuming you have an 'applicationSecurityGroup' defined
        },
    ],
        egress: [
            {
                from_port: 3306,
                to_port: 3306,
                protocol:"tcp",
                securityGroups:[MyApplicationSecurityGroup.id]
                //cidr_blocks = ["0.0.0.0/0"]
              },
        ],
    });   
 
    //RDS Instance
    const rdsInstance = new aws.rds.Instance('MydatabaseRdsInstance', {
        allocatedStorage: 20, // Adjust as needed
        storageType: 'gp2',
        engine: 'mysql', // Use the appropriate engine (mysql, mariadb, or postgres)
        //engineVersion: "5.7",
        instanceClass: 'db.t2.micro', // Use the cheapest one
        identifier:"csye6225",
        dbName: 'csye6225',
        username: 'csye6225',
        password: 'root1234',
        multiAz:false,
        parameterGroupName: rdsParameterGroup.name,
        skipFinalSnapshot: true, // Adjust this based on your needs
        vpcSecurityGroupIds: [dbSecurityGroup.id],
        dbSubnetGroupName:rdsSubnetGroup.name,
        publiclyAccessible: false,
    });
 
//Ec2 instances will be created in Vpc created above
const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
 
    //sets the Amazon Machine Image (AMI) for the EC2 instance.
    ami: debianAmi.then(debianAmi => debianAmi.id),
 
    //instance type for small
    instanceType: "t2.micro",
 
    //Associates the EC2 instance with VPC
    vpc: vpc.id,
 
    //Specifies the subnet in which the EC2 instance should be launched
    //subnetId: privateSubnets[0],
    subnetId: publicSubnets[0],
 
    keyName: "KeyPair_1",
 
    //userData: webappUserData,
    userData : pulumi.interpolate`#!/bin/bash
    rm /home/webappuser/webapp/.env
    echo "DATABASE_HOST= \$(echo ${rdsInstance.endpoint} | cut -d':' -f1)" >> /home/webappuser/webapp/.env
    echo "DATABASE_DIALECT= 'mysql'" >> /home/webappuser/webapp/.env
    echo "DATABASE_USER= ${rdsInstance.username}" >> /home/webappuser/webapp/.env
    echo "DATABASE_PASSWORD= ${rdsInstance.password}" >> /home/webappuser/webapp/.env
    echo "DATABASE_NAME= ${rdsInstance.dbName}" >> /home/webappuser/webapp/.env
    echo "PORT= 8080" >> /home/webappuser/webapp/.env
    `,
 
    //Assigns the EC2 instance to the security group
    vpcSecurityGroupIds: [MyApplicationSecurityGroup.id],
 
    rootBlockDevice: {
 
        volumeSize: 25,
 
        volumeType: "gp2",
 
        deleteOnTermination: true,
 
    },
 
    // Add this to protect against accidental termination.
    disableApiTermination: false,
 
 
});
 
 
 
   // User Data
 
 
 
   
    // webappUserData = pulumi.interpolate`cat <<EOF > /home/admin/webapp/.env
    // NODE_ENV=dev
    // PORT=8087
    // DB_DIALECT=mysql
    // DB_HOST=\$(echo ${rdsInstance.endpoint} | cut -d':' -f1)
    // DB_USER=${rdsInstance.username}
    // DB_PASSWORD=${rdsInstance.password}
    // DB_DATABASE=${rdsInstance.dbName}
    // EOF`;
 
    //webappUserData: pulumi.interpolate`#!/bin/bash\nrm webapp/.env\necho "DATABASE_HOST: mohan.c4tltzid5dl3.us-east-1.rds.amazonaws.com" >> /home/admin/webapp/.env\necho "DATABASE_USER: mohan" >> /home/admin/webapp/.env\necho "DATABASE_PASSWORD: password" >> /home/admin/webapp/.env\necho "DATABASE_NAME: test" >> /home/admin/webapp/.env\necho "PORT: 8080" >> /home/admin/webapp/.env\n`,
 
 
});