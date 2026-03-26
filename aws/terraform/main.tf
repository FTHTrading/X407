# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Terraform Root Module
# ─────────────────────────────────────────────────────────────
terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }

  # Uncomment after first apply to migrate state to S3
  # backend "s3" {
  #   bucket         = "unykorn-terraform-state"
  #   key            = "l1/devnet/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "unykorn-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "UnyKorn-L1"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "FTHTrading"
    }
  }
}

# ─── VPC ───────────────────────────────────────────────────
module "vpc" {
  source = "./modules/vpc"

  project_name   = var.project_name
  environment    = var.environment
  aws_region     = var.aws_region
  vpc_cidr       = var.vpc_cidr
  azs            = var.availability_zones
}

# ─── Security Groups + KMS ────────────────────────────────
module "security" {
  source = "./modules/security"

  project_name   = var.project_name
  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  vpc_cidr       = var.vpc_cidr
  admin_cidr     = var.admin_cidr
  chain_rpc_ports = var.chain_rpc_ports
  chain_p2p_ports = var.chain_p2p_ports
}

# ─── ECR + S3 ────────────────────────────────────────────
module "storage" {
  source = "./modules/storage"

  project_name = var.project_name
  environment  = var.environment
}

# ─── Secrets Manager ─────────────────────────────────────
module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = var.environment
  kms_key_arn  = module.security.kms_key_arn
}

# ─── EC2 Chain Nodes ─────────────────────────────────────
module "compute" {
  source = "./modules/compute"

  project_name       = var.project_name
  environment        = var.environment
  chain_nodes        = var.chain_nodes
  private_subnet_ids = module.vpc.private_chain_subnet_ids
  sg_chain_nodes_id  = module.security.sg_chain_nodes_id
  ecr_repo_url       = module.storage.ecr_node_repo_url
  kms_key_arn        = module.security.kms_key_arn
  node_key_pair              = var.node_key_pair
  node_ami_id                = var.node_ami_id
  node_instance_profile_name = module.security.node_instance_profile_name
}

# ─── Load Balancers ──────────────────────────────────────
module "load_balancing" {
  source = "./modules/load-balancing"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  private_subnet_ids = module.vpc.private_chain_subnet_ids
  sg_alb_public_id   = module.security.sg_alb_public_id
  sg_nlb_rpc_id      = module.security.sg_nlb_rpc_id
  node_instance_ids  = module.compute.node_instance_ids
  rpc_node_id        = module.compute.rpc_node_id
  dashboard_node_id  = module.compute.dashboard_node_id
  certificate_arn    = var.certificate_arn
}

# ─── DNS ─────────────────────────────────────────────────
module "dns" {
  source = "./modules/dns"

  project_name   = var.project_name
  environment    = var.environment
  domain_name    = var.domain_name
  alb_dns_name   = module.load_balancing.alb_dns_name
  alb_zone_id    = module.load_balancing.alb_zone_id
  nlb_dns_name   = module.load_balancing.nlb_dns_name
  nlb_zone_id    = module.load_balancing.nlb_zone_id
  hosted_zone_id = var.hosted_zone_id
}

# ─── Observability ───────────────────────────────────────
module "observability" {
  source = "./modules/observability"

  project_name       = var.project_name
  environment        = var.environment
  aws_region         = var.aws_region
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_services_subnet_ids
  node_instance_ids  = module.compute.node_instance_ids
}

# ─── WAF ─────────────────────────────────────────────────
module "waf" {
  source = "./modules/waf"

  project_name = var.project_name
  environment  = var.environment
  alb_arn      = module.load_balancing.alb_arn
}
