# ─────────────────────────────────────────────────────────────
# Observability Module — UnyKorn L1
# CloudWatch, Amazon Managed Prometheus, Managed Grafana
# ─────────────────────────────────────────────────────────────

variable "project_name"       { type = string }
variable "environment"        { type = string }
variable "aws_region"         { type = string }
variable "vpc_id"             { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "node_instance_ids"  { type = map(string) }

# ─── CloudWatch Log Groups ────────────────────────────────
resource "aws_cloudwatch_log_group" "nodes" {
  for_each = var.node_instance_ids

  name              = "/unykorn/${each.key}"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-logs-${each.key}"
    Node = each.key
  }
}

resource "aws_cloudwatch_log_group" "chain" {
  name              = "/unykorn/chain"
  retention_in_days = 30

  tags = { Name = "${var.project_name}-${var.environment}-logs-chain" }
}

# ─── CloudWatch Dashboard ─────────────────────────────────
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "CPU Utilization — Chain Nodes"
          region  = var.aws_region
          metrics = [
            for name, id in var.node_instance_ids : [
              "AWS/EC2", "CPUUtilization", "InstanceId", id,
              { label = name }
            ]
          ]
          period = 300
          stat   = "Average"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Network In/Out — Chain Nodes"
          region  = var.aws_region
          metrics = flatten([
            for name, id in var.node_instance_ids : [
              ["AWS/EC2", "NetworkIn", "InstanceId", id, { label = "${name}-in" }],
              ["AWS/EC2", "NetworkOut", "InstanceId", id, { label = "${name}-out" }]
            ]
          ])
          period = 300
          stat   = "Average"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title     = "Disk Read/Write — Chain Nodes"
          region    = var.aws_region
          namespace = "UnyKorn/L1"
          metrics = [
            for name, id in var.node_instance_ids : [
              "AWS/EC2", "EBSWriteBytes", "InstanceId", id,
              { label = name }
            ]
          ]
          period = 300
          stat   = "Sum"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title     = "Custom — Block Height / TPS"
          region    = var.aws_region
          namespace = "UnyKorn/L1"
          metrics = [
            ["UnyKorn/L1", "BlockHeight", "Node", "alpha"],
            ["UnyKorn/L1", "TransactionsPerSecond", "Node", "alpha"]
          ]
          period = 60
          stat   = "Maximum"
          view   = "timeSeries"
        }
      }
    ]
  })
}

# ─── CloudWatch Alarms ─────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "node_cpu_high" {
  for_each = var.node_instance_ids

  alarm_name          = "${var.project_name}-${each.key}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "CPU > 85% on ${each.key} for 15 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = each.value
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alarm-cpu-${each.key}"
    Node = each.key
  }
}

resource "aws_cloudwatch_metric_alarm" "node_status_check" {
  for_each = var.node_instance_ids

  alarm_name          = "${var.project_name}-${each.key}-status-check"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Status check failed on ${each.key}"
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = each.value
  }

  alarm_actions = []  # Add SNS topic ARN for alerting

  tags = {
    Name = "${var.project_name}-${var.environment}-alarm-status-${each.key}"
    Node = each.key
  }
}

# ─── Amazon Managed Prometheus ─────────────────────────────
resource "aws_prometheus_workspace" "main" {
  alias = "${var.project_name}-${var.environment}"

  tags = { Name = "${var.project_name}-${var.environment}-prometheus" }
}

# ─── Amazon Managed Grafana ────────────────────────────────
resource "aws_grafana_workspace" "main" {
  name                     = "${var.project_name}-${var.environment}"
  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "SERVICE_MANAGED"
  role_arn                 = aws_iam_role.grafana.arn

  data_sources = ["PROMETHEUS", "CLOUDWATCH"]

  tags = { Name = "${var.project_name}-${var.environment}-grafana" }
}

resource "aws_iam_role" "grafana" {
  name = "${var.project_name}-${var.environment}-grafana-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "grafana.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "grafana" {
  name = "${var.project_name}-${var.environment}-grafana-policy"
  role = aws_iam_role.grafana.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PrometheusRead"
        Effect = "Allow"
        Action = [
          "aps:QueryMetrics",
          "aps:GetSeries",
          "aps:GetLabels",
          "aps:GetMetricMetadata"
        ]
        Resource = aws_prometheus_workspace.main.arn
      },
      {
        Sid    = "CloudWatchRead"
        Effect = "Allow"
        Action = [
          "cloudwatch:DescribeAlarmsForMetric",
          "cloudwatch:DescribeAlarmHistory",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListMetrics",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetInsightRuleReport",
          "logs:DescribeLogGroups",
          "logs:GetLogGroupFields",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
          "logs:GetLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─── Outputs ───────────────────────────────────────────────
output "prometheus_endpoint" {
  value = aws_prometheus_workspace.main.prometheus_endpoint
}

output "prometheus_workspace_id" {
  value = aws_prometheus_workspace.main.id
}

output "grafana_endpoint" {
  value = aws_grafana_workspace.main.endpoint
}

output "cloudwatch_dashboard_name" {
  value = aws_cloudwatch_dashboard.main.dashboard_name
}
