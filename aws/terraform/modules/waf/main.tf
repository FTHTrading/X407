# ─────────────────────────────────────────────────────────────
# WAF Module — UnyKorn L1
# AWS WAFv2 Web ACL for ALB
# ─────────────────────────────────────────────────────────────

variable "project_name" { type = string }
variable "environment"  { type = string }
variable "alb_arn"      { type = string }

# ─── Web ACL ──────────────────────────────────────────────
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-${var.environment}-waf"
  description = "WAF rules for UnyKorn L1 public endpoints"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # ── Rule 1: AWS Managed — Common Rule Set ───────────────
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 2: AWS Managed — Known Bad Inputs ──────────────
  rule {
    name     = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 3: AWS Managed — IP Reputation ─────────────────
  rule {
    name     = "AWS-AWSManagedRulesAmazonIpReputationList"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "IPReputation"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 4: Rate Limiting ───────────────────────────────
  rule {
    name     = "RateLimit"
    priority = 4

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 5: Geo Blocking (optional — compliance) ────────
  # Uncomment to restrict by country
  # rule {
  #   name     = "GeoBlock"
  #   priority = 5
  #   action { block {} }
  #   statement {
  #     geo_match_statement {
  #       country_codes = ["KP", "IR", "CU", "SY"]  # OFAC sanctioned
  #     }
  #   }
  #   visibility_config {
  #     cloudwatch_metrics_enabled = true
  #     metric_name                = "GeoBlock"
  #     sampled_requests_enabled   = true
  #   }
  # }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-${var.environment}-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${var.project_name}-${var.environment}-waf" }
}

# ─── Associate WAF with ALB ───────────────────────────────
resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

# ─── WAF Logging ──────────────────────────────────────────
resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-${var.project_name}-${var.environment}"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.main.arn
}

# ─── Outputs ───────────────────────────────────────────────
output "waf_acl_arn" {
  value = aws_wafv2_web_acl.main.arn
}

output "waf_acl_id" {
  value = aws_wafv2_web_acl.main.id
}
