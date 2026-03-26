# ─────────────────────────────────────────────────────────────
# DNS Module — UnyKorn L1
# Route 53 records
# ─────────────────────────────────────────────────────────────

variable "project_name"   { type = string }
variable "environment"    { type = string }
variable "domain_name"    { type = string }
variable "alb_dns_name"   { type = string }
variable "alb_zone_id"    { type = string }
variable "nlb_dns_name"   { type = string }
variable "nlb_zone_id"    { type = string }
variable "hosted_zone_id" { type = string }

# ─── Create hosted zone if needed ──────────────────────────
resource "aws_route53_zone" "main" {
  count = var.hosted_zone_id == "" ? 1 : 0
  name  = var.domain_name

  tags = { Name = "${var.project_name}-${var.environment}-zone" }
}

locals {
  zone_id = var.hosted_zone_id != "" ? var.hosted_zone_id : aws_route53_zone.main[0].zone_id
}

# ─── Root domain → ALB ────────────────────────────────────
resource "aws_route53_record" "root" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# ─── RPC subdomain → NLB ─────────────────────────────────
resource "aws_route53_record" "rpc" {
  zone_id = local.zone_id
  name    = "rpc.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.nlb_dns_name
    zone_id                = var.nlb_zone_id
    evaluate_target_health = true
  }
}

# ─── API subdomain → ALB ─────────────────────────────────
resource "aws_route53_record" "api" {
  zone_id = local.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# ─── Demo subdomain → ALB ────────────────────────────────
resource "aws_route53_record" "demo" {
  zone_id = local.zone_id
  name    = "demo.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# ─── x402 service subdomains → ALB ───────────────────────
# These resolve to the same ALB; host-based listener rules
# route to the correct target group.
resource "aws_route53_record" "x402" {
  zone_id = local.zone_id
  name    = "x402.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "facilitator" {
  zone_id = local.zone_id
  name    = "facilitator.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "treasury" {
  zone_id = local.zone_id
  name    = "treasury.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "guardian" {
  zone_id = local.zone_id
  name    = "guardian.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# ─── Outputs ───────────────────────────────────────────────
output "zone_id" {
  value = local.zone_id
}

output "nameservers" {
  value = var.hosted_zone_id == "" ? aws_route53_zone.main[0].name_servers : []
}
