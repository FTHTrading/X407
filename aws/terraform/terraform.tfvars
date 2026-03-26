# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Example tfvars (copy to devnet.tfvars)
# ─────────────────────────────────────────────────────────────

aws_region          = "us-east-1"
project_name        = "unykorn-l1"
environment         = "devnet"
vpc_cidr            = "10.100.0.0/16"
availability_zones  = ["us-east-1a", "us-east-1b"]

# CHANGE THIS: restrict to your IP
admin_cidr          = ["76.230.229.105/32"]

# EC2 key pair name (create in AWS console first)
node_key_pair       = "unykorn-devnet-key"

# Leave empty to auto-detect latest Amazon Linux 2023
node_ami_id         = ""

# ACM certificate ARN — ISSUED & validated via DNS (2026-03-26)
certificate_arn     = "arn:aws:acm:us-east-1:933629770808:certificate/d51e9d27-0298-4e88-84f3-65f8b32aed21"

# Route 53 hosted zone — confirmed in AWS: Z08184221LQW6HTHIC1D2
domain_name         = "l1.unykorn.org"
hosted_zone_id      = "Z08184221LQW6HTHIC1D2"
