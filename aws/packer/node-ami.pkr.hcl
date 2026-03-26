# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — Packer AMI for Chain Nodes
# Pre-bakes Docker, CloudWatch agent, tools onto Amazon Linux 2023
# ─────────────────────────────────────────────────────────────

packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = "~> 1.3"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "instance_type" {
  type    = string
  default = "c6a.large"
}

variable "ami_name_prefix" {
  type    = string
  default = "unykorn-l1-node"
}

source "amazon-ebs" "node" {
  ami_name      = "${var.ami_name_prefix}-{{timestamp}}"
  instance_type = var.instance_type
  region        = var.aws_region

  source_ami_filter {
    filters = {
      name                = "al2023-ami-*-x86_64"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["amazon"]
  }

  ssh_username = "ec2-user"

  tags = {
    Name        = "${var.ami_name_prefix}-{{timestamp}}"
    Project     = "UnyKorn-L1"
    ManagedBy   = "packer"
    BaseAMI     = "{{ .SourceAMI }}"
    BuildTime   = "{{timestamp}}"
  }

  run_tags = {
    Name = "packer-build-unykorn-node"
  }
}

build {
  sources = ["source.amazon-ebs.node"]

  # System updates
  provisioner "shell" {
    inline = [
      "sudo yum update -y",
      "sudo yum install -y docker jq curl wget htop iotop",
      "sudo systemctl enable docker",
      "sudo usermod -aG docker ec2-user"
    ]
  }

  # CloudWatch agent
  provisioner "shell" {
    inline = [
      "sudo yum install -y amazon-cloudwatch-agent",
      "sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status"
    ]
  }

  # SSM agent (usually pre-installed on AL2023)
  provisioner "shell" {
    inline = [
      "sudo yum install -y amazon-ssm-agent || true",
      "sudo systemctl enable amazon-ssm-agent"
    ]
  }

  # Create data directories
  provisioner "shell" {
    inline = [
      "sudo mkdir -p /data/unykorn/{blocks,state,meta}",
      "sudo mkdir -p /var/log/unykorn",
      "sudo chown -R ec2-user:ec2-user /data/unykorn /var/log/unykorn"
    ]
  }

  # Pre-configure CloudWatch agent
  provisioner "file" {
    content = <<-CW
{
  "agent": { "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/unykorn/*.log",
            "log_group_name": "/unykorn/node",
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
      "cpu":  { "measurement": ["cpu_usage_active"], "metrics_collection_interval": 30 },
      "mem":  { "measurement": ["mem_used_percent"], "metrics_collection_interval": 30 },
      "disk": { "measurement": ["used_percent"], "metrics_collection_interval": 60 },
      "net":  { "measurement": ["bytes_sent", "bytes_recv"], "metrics_collection_interval": 30 }
    }
  }
}
CW
    destination = "/tmp/amazon-cloudwatch-agent.json"
  }

  provisioner "shell" {
    inline = [
      "sudo cp /tmp/amazon-cloudwatch-agent.json /opt/aws/amazon-cloudwatch-agent/etc/",
      "sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json"
    ]
  }

  # Cleanup
  provisioner "shell" {
    inline = [
      "sudo yum clean all",
      "sudo rm -rf /tmp/*",
      "history -c"
    ]
  }
}
