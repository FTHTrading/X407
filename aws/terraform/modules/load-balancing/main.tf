# ─────────────────────────────────────────────────────────────
# Load Balancing Module — UnyKorn L1
# ALB (web/dashboard), NLB (RPC)
# ─────────────────────────────────────────────────────────────

variable "project_name"       { type = string }
variable "environment"        { type = string }
variable "vpc_id"             { type = string }
variable "public_subnet_ids"  { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "sg_alb_public_id"   { type = string }
variable "sg_nlb_rpc_id"      { type = string }
variable "node_instance_ids"  { type = map(string) }
variable "rpc_node_id"        { type = string }
variable "dashboard_node_id"  { type = string }
variable "x402_node_id"       { type = string }
variable "certificate_arn"    { type = string }
variable "domain_name"        { type = string }

# ─── ALB (Web / Dashboard) ────────────────────────────────
resource "aws_lb" "web" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.sg_alb_public_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false  # Set true in production

  access_logs {
    bucket  = ""  # Set to S3 bucket after creation
    enabled = false
  }

  tags = { Name = "${var.project_name}-${var.environment}-alb" }
}

# HTTPS listener
resource "aws_lb_listener" "https" {
  count = var.certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.web.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }
}

# HTTP → HTTPS redirect (when cert exists)
resource "aws_lb_listener" "http_redirect" {
  count = var.certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTP forward (when no cert yet — direct access)
resource "aws_lb_listener" "http_forward" {
  count = var.certificate_arn == "" ? 1 : 0

  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }
}

# Dashboard target group
resource "aws_lb_target_group" "dashboard" {
  name     = "${var.project_name}-${var.environment}-dashboard"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  tags = { Name = "${var.project_name}-${var.environment}-tg-dashboard" }
}

resource "aws_lb_target_group_attachment" "dashboard" {
  target_group_arn = aws_lb_target_group.dashboard.arn
  target_id        = var.dashboard_node_id
  port             = 3000
}

# ─── ALB Listener Rules ───────────────────────────────────
# /api/* → RPC backend (via ALB path-based routing)
resource "aws_lb_target_group" "api" {
  name     = "${var.project_name}-${var.environment}-api"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  tags = { Name = "${var.project_name}-${var.environment}-tg-api" }
}

resource "aws_lb_target_group_attachment" "api" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = var.rpc_node_id
  port             = 3001
}

# ALB Listener Rule: /api/* → API target group
resource "aws_lb_listener_rule" "api" {
  count        = var.certificate_arn != "" ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern { values = ["/api/*"] }
  }
}

# ─── x402 Payment Protocol — Target Groups ───────────────
# These target delta which runs the x402 services stack

locals {
  x402_services = {
    facilitator = { port = 3100, health_path = "/health", priority = 200 }
    treasury    = { port = 3200, health_path = "/health", priority = 210 }
    guardian    = { port = 3300, health_path = "/health", priority = 220 }
    fincore     = { port = 4400, health_path = "/health", priority = 230 }
  }
}

resource "aws_lb_target_group" "x402" {
  for_each = local.x402_services

  name     = "${var.project_name}-x402-${each.key}"
  port     = each.value.port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = each.value.health_path
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  tags = { Name = "${var.project_name}-x402-tg-${each.key}" }
}

resource "aws_lb_target_group_attachment" "x402" {
  for_each = local.x402_services

  target_group_arn = aws_lb_target_group.x402[each.key].arn
  target_id        = var.x402_node_id
  port             = each.value.port
}

# ─── x402 ALB Listener Rules (host-based routing) ────────
# facilitator.l1.unykorn.org → facilitator:3100
# treasury.l1.unykorn.org    → treasury:3200
# guardian.l1.unykorn.org    → guardian:3300
# x402.l1.unykorn.org        → facilitator:3100 (primary)

locals {
  x402_host_rules = {
    facilitator = { key = "facilitator", host = "facilitator.${var.domain_name}", priority = 200 }
    treasury    = { key = "treasury",    host = "treasury.${var.domain_name}",    priority = 210 }
    guardian    = { key = "guardian",     host = "guardian.${var.domain_name}",    priority = 220 }
  }
}

resource "aws_lb_listener_rule" "x402" {
  for_each = var.certificate_arn != "" ? local.x402_host_rules : {}

  listener_arn = aws_lb_listener.https[0].arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.x402[each.key].arn
  }

  condition {
    host_header { values = [each.value.host] }
  }
}

# x402.l1.unykorn.org catch-all → facilitator (primary x402 service)
resource "aws_lb_listener_rule" "x402_default" {
  count        = var.certificate_arn != "" ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 250

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.x402["facilitator"].arn
  }

  condition {
    host_header { values = ["x402.${var.domain_name}"] }
  }
}

# ─── NLB (JSON-RPC — TCP) ─────────────────────────────────
resource "aws_lb" "rpc" {
  name               = "${var.project_name}-${var.environment}-nlb"
  internal           = false
  load_balancer_type = "network"
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false

  tags = { Name = "${var.project_name}-${var.environment}-nlb" }
}

resource "aws_lb_target_group" "rpc" {
  name     = "${var.project_name}-${var.environment}-rpc"
  port     = 3001
  protocol = "TCP"
  vpc_id   = var.vpc_id

  health_check {
    protocol            = "TCP"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 10
  }

  tags = { Name = "${var.project_name}-${var.environment}-tg-rpc" }
}

resource "aws_lb_listener" "rpc" {
  load_balancer_arn = aws_lb.rpc.arn
  port              = 3001
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.rpc.arn
  }
}

resource "aws_lb_target_group_attachment" "rpc" {
  target_group_arn = aws_lb_target_group.rpc.arn
  target_id        = var.rpc_node_id
  port             = 3001
}

# ─── Outputs ───────────────────────────────────────────────
output "alb_arn" {
  value = aws_lb.web.arn
}

output "alb_dns_name" {
  value = aws_lb.web.dns_name
}

output "alb_zone_id" {
  value = aws_lb.web.zone_id
}

output "nlb_dns_name" {
  value = aws_lb.rpc.dns_name
}

output "nlb_zone_id" {
  value = aws_lb.rpc.zone_id
}
