# ─────────────────────────────────────────────────────────────
# Compute Module — UnyKorn L1 Chain Nodes
# EC2 instances, EBS volumes, launch templates
# ─────────────────────────────────────────────────────────────

variable "project_name"       { type = string }
variable "environment"        { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "sg_chain_nodes_id"  { type = string }
variable "ecr_repo_url"       { type = string }
variable "kms_key_arn"        { type = string }
variable "node_key_pair"      { type = string }
variable "node_ami_id"              { type = string }
variable "node_instance_profile_name" { type = string }

variable "chain_nodes" {
  type = map(object({
    role          = string
    instance_type = string
    volume_size   = number
    rpc_port      = number
    p2p_port      = number
    az_index      = number
  }))
}

# ─── AMI Lookup (Amazon Linux 2023) ───────────────────────
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  ami_id = var.node_ami_id != "" ? var.node_ami_id : data.aws_ami.al2023.id
}

# ─── IAM Instance Profile (passed from security module) ───

# ─── User Data Template ───────────────────────────────────
locals {
  user_data_template = <<-USERDATA
#!/bin/bash
set -euo pipefail

# ── System setup ──────────────────────────────────────────
yum update -y
yum install -y docker jq awscli

# ── Start Docker ──────────────────────────────────────────
systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user

# ── CloudWatch agent ──────────────────────────────────────
yum install -y amazon-cloudwatch-agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CW_EOF'
{
  "agent": { "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/unykorn/*.log",
            "log_group_name": "/unykorn/__NODE_NAME__",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 30
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "UnyKorn/L1",
    "metrics_collected": {
      "cpu":    { "measurement": ["cpu_usage_active"], "metrics_collection_interval": 30 },
      "mem":    { "measurement": ["mem_used_percent"], "metrics_collection_interval": 30 },
      "disk":   { "measurement": ["used_percent"], "metrics_collection_interval": 60 },
      "net":    { "measurement": ["bytes_sent", "bytes_recv"], "metrics_collection_interval": 30 }
    }
  }
}
CW_EOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# ── Prepare data directory ────────────────────────────────
mkdir -p /data/unykorn/{blocks,state,meta}
mkdir -p /var/log/unykorn
chown -R ec2-user:ec2-user /data/unykorn /var/log/unykorn

# ── Pull node image ───────────────────────────────────────
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin __ECR_URL__

docker pull __ECR_URL__:latest

# ── Fetch node key from Secrets Manager ───────────────────
NODE_KEY=$(aws secretsmanager get-secret-value \
  --secret-id unykorn/l1/node-keys \
  --query 'SecretString' --output text | jq -r '.__NODE_NAME__')

# ── Write node config ────────────────────────────────────
cat > /data/unykorn/node.toml <<TOML_EOF
[node]
name = "__NODE_NAME__"
role = "__NODE_ROLE__"
chain_id = 7331
data_dir = "/data/unykorn"

[network]
listen_port = __P2P_PORT__
rpc_port = __RPC_PORT__
rpc_bind = "0.0.0.0"

[identity]
node_key_seed = "$NODE_KEY"

[consensus]
block_time_ms = 3000

[metrics]
prometheus_port = 9090
TOML_EOF

# ── Run node ──────────────────────────────────────────────
docker run -d \
  --name unykorn-__NODE_NAME__ \
  --restart unless-stopped \
  --network host \
  -v /data/unykorn:/data/unykorn \
  -v /var/log/unykorn:/var/log/unykorn \
  -e NODE_NAME=__NODE_NAME__ \
  -e NODE_ROLE=__NODE_ROLE__ \
  -e RUST_LOG=info \
  __ECR_URL__:latest \
  --config /data/unykorn/node.toml

echo "UnyKorn node __NODE_NAME__ started"
USERDATA
}

# ─── EC2 Instances ─────────────────────────────────────────
resource "aws_instance" "chain_node" {
  for_each = var.chain_nodes

  ami                    = local.ami_id
  instance_type          = each.value.instance_type
  key_name               = var.node_key_pair
  subnet_id              = var.private_subnet_ids[each.value.az_index]
  vpc_security_group_ids = [var.sg_chain_nodes_id]
  iam_instance_profile   = var.node_instance_profile_name

  root_block_device {
    volume_type           = "gp3"
    volume_size           = each.value.volume_size
    iops                  = 3000
    throughput            = 125
    encrypted             = true
    kms_key_id            = var.kms_key_arn
    delete_on_termination = false

    tags = { Name = "${var.project_name}-${var.environment}-${each.key}-root" }
  }

  user_data = base64encode(
    replace(
      replace(
        replace(
          replace(
            replace(
              local.user_data_template,
              "__NODE_NAME__", each.key
            ),
            "__NODE_ROLE__", each.value.role
          ),
          "__RPC_PORT__", tostring(each.value.rpc_port)
        ),
        "__P2P_PORT__", tostring(each.value.p2p_port)
      ),
      "__ECR_URL__", var.ecr_repo_url
    )
  )

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"  # IMDSv2 only
  }

  monitoring = true  # detailed monitoring

  tags = {
    Name = "${var.project_name}-${var.environment}-${each.key}"
    Role = each.value.role
    Node = each.key
  }

  lifecycle {
    ignore_changes = [ami]  # Don't recreate on AMI update
  }
}

# ─── Outputs ───────────────────────────────────────────────
output "node_instance_ids" {
  description = "Map of node name to instance ID"
  value       = { for k, v in aws_instance.chain_node : k => v.id }
}

output "node_private_ips" {
  description = "Map of node name to private IP"
  value       = { for k, v in aws_instance.chain_node : k => v.private_ip }
}

output "rpc_node_id" {
  description = "Instance ID of the primary RPC node (alpha)"
  value       = aws_instance.chain_node["alpha"].id
}

output "dashboard_node_id" {
  description = "Instance ID for dashboard (alpha for now)"
  value       = aws_instance.chain_node["alpha"].id
}

output "x402_node_id" {
  description = "Instance ID for x402 services (delta)"
  value       = aws_instance.chain_node["delta"].id
}
