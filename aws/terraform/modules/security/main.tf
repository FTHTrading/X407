# ─────────────────────────────────────────────────────────────
# Security Module — UnyKorn L1
# Security Groups, KMS, IAM for chain nodes
# ─────────────────────────────────────────────────────────────

variable "project_name"   { type = string }
variable "environment"    { type = string }
variable "vpc_id"         { type = string }
variable "vpc_cidr"       { type = string }
variable "admin_cidr"     { type = list(string) }
variable "chain_rpc_ports" { type = list(number) }
variable "chain_p2p_ports" { type = list(number) }

data "aws_caller_identity" "current" {}

# ─── KMS Key for encryption at rest ───────────────────────
resource "aws_kms_key" "main" {
  description             = "${var.project_name} encryption key"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccount"
        Effect = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Principal = { Service = "logs.amazonaws.com" }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = { Name = "${var.project_name}-${var.environment}-kms" }
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.project_name}-${var.environment}"
  target_key_id = aws_kms_key.main.key_id
}

# ─── SG: ALB Public ───────────────────────────────────────
resource "aws_security_group" "alb_public" {
  name_prefix = "${var.project_name}-alb-public-"
  description = "ALB public ingress -- HTTPS + HTTP redirect"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-sg-alb-public" }

  lifecycle { create_before_destroy = true }
}

# ─── SG: NLB RPC ──────────────────────────────────────────
resource "aws_security_group" "nlb_rpc" {
  name_prefix = "${var.project_name}-nlb-rpc-"
  description = "NLB RPC ingress -- chain JSON-RPC"
  vpc_id      = var.vpc_id

  # Primary RPC port (alpha node — public-facing gateway)
  ingress {
    description = "RPC gateway"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restrict in production
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-sg-nlb-rpc" }

  lifecycle { create_before_destroy = true }
}

# ─── SG: Chain Nodes ──────────────────────────────────────
resource "aws_security_group" "chain_nodes" {
  name_prefix = "${var.project_name}-chain-nodes-"
  description = "Chain node P2P + internal RPC"
  vpc_id      = var.vpc_id

  # P2P: nodes talk to each other
  dynamic "ingress" {
    for_each = var.chain_p2p_ports
    content {
      description = "P2P port ${ingress.value}"
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      self        = true
    }
  }

  # RPC: internal access from services + NLB
  dynamic "ingress" {
    for_each = var.chain_rpc_ports
    content {
      description     = "RPC port ${ingress.value}"
      from_port       = ingress.value
      to_port         = ingress.value
      protocol        = "tcp"
      cidr_blocks     = [var.vpc_cidr]
    }
  }

  # Prometheus metrics scrape
  ingress {
    description = "Prometheus metrics"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # SSH from bastion / SSM
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.admin_cidr
  }

  # ─── x402 service ports from ALB (delta runs x402 stack) ─
  ingress {
    description     = "x402 Facilitator from ALB"
    from_port       = 3100
    to_port         = 3100
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description     = "x402 Treasury from ALB"
    from_port       = 3200
    to_port         = 3200
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description     = "x402 Guardian from ALB"
    from_port       = 3300
    to_port         = 3300
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description     = "x402 Financial Core from ALB"
    from_port       = 4400
    to_port         = 4400
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-sg-chain-nodes" }

  lifecycle { create_before_destroy = true }
}

# ─── SG: Services (dashboard, explorer, monitoring) ───────
resource "aws_security_group" "services" {
  name_prefix = "${var.project_name}-services-"
  description = "Internal services -- dashboard, explorer, Grafana"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description     = "Grafana from ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  # ─── x402 service ports from ALB ───────────────────────
  ingress {
    description     = "x402 Facilitator from ALB"
    from_port       = 3100
    to_port         = 3100
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description     = "x402 Treasury from ALB"
    from_port       = 3200
    to_port         = 3200
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description     = "x402 Guardian from ALB"
    from_port       = 3300
    to_port         = 3300
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description     = "x402 Financial Core from ALB"
    from_port       = 4400
    to_port         = 4400
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_public.id]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.admin_cidr
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-sg-services" }

  lifecycle { create_before_destroy = true }
}

# ─── IAM: EC2 Instance Role ───────────────────────────────
resource "aws_iam_role" "node" {
  name = "${var.project_name}-${var.environment}-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = { Name = "${var.project_name}-${var.environment}-node-role" }
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "node_permissions" {
  name = "${var.project_name}-${var.environment}-node-policy"
  role = aws_iam_role.node.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "S3Snapshots"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-*",
          "arn:aws:s3:::${var.project_name}-*/*"
        ]
      },
      {
        Sid    = "SecretsRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:*:*:secret:unykorn/*"
      },
      {
        Sid    = "KMSDecrypt"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [aws_kms_key.main.arn]
      },
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:CreateLogGroup"
        ]
        Resource = "*"
      },
      {
        Sid    = "PrometheusWrite"
        Effect = "Allow"
        Action = [
          "aps:RemoteWrite"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "node" {
  name = "${var.project_name}-${var.environment}-node-profile"
  role = aws_iam_role.node.name
}

# ─── Outputs ───────────────────────────────────────────────
output "kms_key_arn" {
  value = aws_kms_key.main.arn
}

output "kms_key_id" {
  value = aws_kms_key.main.key_id
}

output "sg_alb_public_id" {
  value = aws_security_group.alb_public.id
}

output "sg_nlb_rpc_id" {
  value = aws_security_group.nlb_rpc.id
}

output "sg_chain_nodes_id" {
  value = aws_security_group.chain_nodes.id
}

output "sg_services_id" {
  value = aws_security_group.services.id
}

output "node_instance_profile_name" {
  value = aws_iam_instance_profile.node.name
}

output "node_instance_profile_arn" {
  value = aws_iam_instance_profile.node.arn
}
