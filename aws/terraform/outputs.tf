# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Outputs
# ─────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_chain_subnet_ids" {
  description = "Private chain node subnet IDs"
  value       = module.vpc.private_chain_subnet_ids
}

output "node_instance_ids" {
  description = "Map of node name to EC2 instance ID"
  value       = module.compute.node_instance_ids
}

output "node_private_ips" {
  description = "Map of node name to private IP"
  value       = module.compute.node_private_ips
}

output "alb_dns_name" {
  description = "ALB DNS name for dashboard/web"
  value       = module.load_balancing.alb_dns_name
}

output "nlb_dns_name" {
  description = "NLB DNS name for RPC"
  value       = module.load_balancing.nlb_dns_name
}

output "ecr_node_repo_url" {
  description = "ECR repository URL for node images"
  value       = module.storage.ecr_node_repo_url
}

output "s3_snapshots_bucket" {
  description = "S3 bucket name for chain snapshots"
  value       = module.storage.s3_snapshots_bucket
}

output "kms_key_arn" {
  description = "KMS key ARN for encryption"
  value       = module.security.kms_key_arn
}

output "prometheus_endpoint" {
  description = "Amazon Managed Prometheus workspace endpoint"
  value       = module.observability.prometheus_endpoint
}

output "grafana_endpoint" {
  description = "Amazon Managed Grafana workspace endpoint"
  value       = module.observability.grafana_endpoint
}

output "ecr_dashboard_repo_url" {
  description = "ECR repository URL for dashboard images"
  value       = module.storage.ecr_dashboard_repo_url
}

output "alb_arn" {
  description = "ALB ARN"
  value       = module.load_balancing.alb_arn
}
