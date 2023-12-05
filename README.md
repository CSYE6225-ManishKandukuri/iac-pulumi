# iac-pulumi
# Infrastructure as Code (IaC) README

## Prerequisites


## Setup Instructions

1. Clone the repository.
2. Use Pulumi for infrastructure setup and tear down.

## AWS Networking Setup

- Create Virtual Private Cloud (VPC).
- Create subnets in VPC.
- Create an Internet Gateway and attach it to VPC.
- Create public and private route tables.

## AWS IAM Setup

- Create IAM users and groups.
- Create a read-only group with ReadOnlyAccess policy attached.

## Infrastructure as Code Updates

- Pulumi creates Google Cloud Storage bucket and Service Account.
- Pulumi creates Lambda Function, DynamoDB instance, IAM Roles & Policies.

IMPORT COMMAND for installing certificate: aws acm import-certificate --certificate file://certificate.pem --certificate-chain file://ca_bundle.pem --private-key file://private.key --profile manish_demo --region us-east-1