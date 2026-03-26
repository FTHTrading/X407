# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Input Variables
# ─────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project identifier used in resource naming"
  type        = string
  default     = "unykorn-l1"
}

variable "environment" {
  description = "Environment name (devnet, staging, production)"
  type        = string
  default     = "devnet"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.100.0.0/16"
}

variable "availability_zones" {
  description = "AZs for multi-AZ deployment"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "admin_cidr" {
  description = "CIDR block for SSH/admin access (your IP)"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # CHANGE THIS to your IP/32
}

variable "chain_rpc_ports" {
  description = "RPC ports for chain nodes"
  type        = list(number)
  default     = [3001, 3002, 3003, 3004, 3005]
}

variable "chain_p2p_ports" {
  description = "P2P ports for chain nodes"
  type        = list(number)
  default     = [30301, 30302, 30303, 30304, 30305]
}

variable "node_key_pair" {
  description = "EC2 key pair name for SSH access"
  type        = string
}

variable "node_ami_id" {
  description = "AMI ID for chain nodes (Amazon Linux 2023 or custom Packer AMI)"
  type        = string
  default     = ""  # Set in .tfvars or use data source
}

variable "certificate_arn" {
  description = "ACM certificate ARN for ALB HTTPS"
  type        = string
  default     = ""  # Set after ACM provisioning
}

variable "domain_name" {
  description = "Base domain for DNS records"
  type        = string
  default     = "l1.unykorn.org"
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
  default     = ""  # Set after zone creation
}

variable "chain_nodes" {
  description = "Map of chain node definitions"
  type = map(object({
    role          = string
    instance_type = string
    volume_size   = number
    rpc_port      = number
    p2p_port      = number
    az_index      = number  # 0 or 1 for AZ placement
  }))
  default = {
    alpha = {
      role          = "producer"
      instance_type = "c6a.xlarge"
      volume_size   = 200
      rpc_port      = 3001
      p2p_port      = 30301
      az_index      = 0
    }
    bravo = {
      role          = "validator"
      instance_type = "c6a.xlarge"
      volume_size   = 200
      rpc_port      = 3002
      p2p_port      = 30302
      az_index      = 0
    }
    charlie = {
      role          = "validator"
      instance_type = "c6a.xlarge"
      volume_size   = 200
      rpc_port      = 3003
      p2p_port      = 30303
      az_index      = 1
    }
    delta = {
      role          = "oracle"
      instance_type = "c6a.large"
      volume_size   = 100
      rpc_port      = 3004
      p2p_port      = 30304
      az_index      = 0
    }
    echo = {
      role          = "oracle"
      instance_type = "c6a.large"
      volume_size   = 100
      rpc_port      = 3005
      p2p_port      = 30305
      az_index      = 1
    }
  }
}
