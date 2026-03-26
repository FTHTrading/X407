# ─────────────────────────────────────────────────────────────
# VPC Module — UnyKorn L1
# ─────────────────────────────────────────────────────────────

variable "project_name" { type = string }
variable "environment"  { type = string }
variable "aws_region"   { type = string }
variable "vpc_cidr"     { type = string }
variable "azs"          { type = list(string) }

# ─── VPC ───────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${var.project_name}-${var.environment}-vpc" }
}

# ─── Internet Gateway ─────────────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-${var.environment}-igw" }
}

# ─── NAT Gateway (single, cost-aware) ─────────────────────
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-${var.environment}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${var.project_name}-${var.environment}-nat" }

  depends_on = [aws_internet_gateway.main]
}

# ─── Public Subnets ────────────────────────────────────────
resource "aws_subnet" "public" {
  count = length(var.azs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)  # 10.100.1.0/24, 10.100.2.0/24
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-${var.environment}-public-${var.azs[count.index]}"
    Tier = "public"
  }
}

# ─── Private Subnets: Chain Nodes ──────────────────────────
resource "aws_subnet" "private_chain" {
  count = length(var.azs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)  # 10.100.10.0/24, 10.100.11.0/24
  availability_zone = var.azs[count.index]

  tags = {
    Name = "${var.project_name}-${var.environment}-private-chain-${var.azs[count.index]}"
    Tier = "private-chain"
  }
}

# ─── Private Subnets: Services ─────────────────────────────
resource "aws_subnet" "private_services" {
  count = length(var.azs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 20)  # 10.100.20.0/24, 10.100.21.0/24
  availability_zone = var.azs[count.index]

  tags = {
    Name = "${var.project_name}-${var.environment}-private-svc-${var.azs[count.index]}"
    Tier = "private-services"
  }
}

# ─── Isolated Subnets: Data (reserved) ─────────────────────
resource "aws_subnet" "isolated_data" {
  count = length(var.azs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 30)  # 10.100.30.0/24, 10.100.31.0/24
  availability_zone = var.azs[count.index]

  tags = {
    Name = "${var.project_name}-${var.environment}-isolated-data-${var.azs[count.index]}"
    Tier = "isolated"
  }
}

# ─── Route Tables ──────────────────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-${var.environment}-rt-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-${var.environment}-rt-private" }
}

resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}

resource "aws_route_table_association" "private_chain" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.private_chain[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_services" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.private_services[count.index].id
  route_table_id = aws_route_table.private.id
}

# Isolated subnets — no route to internet (data tier)
resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-${var.environment}-rt-isolated" }
}

resource "aws_route_table_association" "isolated" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.isolated_data[count.index].id
  route_table_id = aws_route_table.isolated.id
}

# ─── VPC Flow Logs ─────────────────────────────────────────
resource "aws_flow_log" "main" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flow_log.arn
  iam_role_arn         = aws_iam_role.flow_log.arn

  tags = { Name = "${var.project_name}-${var.environment}-flow-log" }
}

resource "aws_cloudwatch_log_group" "flow_log" {
  name              = "/aws/vpc/flow-log/${var.project_name}-${var.environment}"
  retention_in_days = 30
}

resource "aws_iam_role" "flow_log" {
  name = "${var.project_name}-${var.environment}-vpc-flow-log-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "flow_log" {
  name = "${var.project_name}-${var.environment}-vpc-flow-log-policy"
  role = aws_iam_role.flow_log.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}

# ─── Outputs ───────────────────────────────────────────────
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_chain_subnet_ids" {
  value = aws_subnet.private_chain[*].id
}

output "private_services_subnet_ids" {
  value = aws_subnet.private_services[*].id
}

output "isolated_data_subnet_ids" {
  value = aws_subnet.isolated_data[*].id
}

output "nat_gateway_ip" {
  value = aws_eip.nat.public_ip
}
