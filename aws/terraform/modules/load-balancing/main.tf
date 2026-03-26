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
variable "certificate_arn"    { type = string }

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
