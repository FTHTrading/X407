#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Verifies the UnyKorn L1 AWS environment end-to-end.
  Account: 933629770808 | Region: us-east-1

.DESCRIPTION
  Checks: EC2 state, ECR images, NLB health, route53 resolution,
  target group health, instance reachability via SSM, and CloudWatch log status.

.EXAMPLE
  .\verify-aws.ps1
  .\verify-aws.ps1 -Region eu-west-1
#>

param(
    [string]$Region    = "us-east-1",
    [string]$Project   = "UnyKorn-L1",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

$ECR_REGISTRY = "933629770808.dkr.ecr.us-east-1.amazonaws.com"
$ECR_NODE_REPO = "unykorn-l1/node"
$NLB_TG_NAME  = "unykorn-l1-devnet-rpc"
$RPC_DNS      = "rpc.l1.unykorn.org"
$RPC_PORT     = 3001
$HOSTED_ZONE  = "Z08184221LQW6HTHIC1D2"

$PASS = "[PASS]"
$FAIL = "[FAIL]"
$WARN = "[WARN]"
$INFO = "[INFO]"

$results = @()

function Check {
    param($Name, $Status, $Detail)
    $sym = if ($Status -eq "pass") { $PASS } elseif ($Status -eq "fail") { $FAIL } else { $WARN }
    Write-Host "$sym  $Name — $Detail"
    $results += [PSCustomObject]@{ Check=$Name; Status=$Status; Detail=$Detail }
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  UnyKorn L1 — AWS Verification Report"
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "============================================================"
Write-Host ""

# ── 1. AWS Auth ─────────────────────────────────────────────
Write-Host "--- AWS Identity ---"
try {
    $id = aws sts get-caller-identity --output json | ConvertFrom-Json
    Check "AWS Auth" "pass" "Account=$($id.Account) Arn=$($id.Arn)"
} catch {
    Check "AWS Auth" "fail" "Cannot authenticate — check AWS credentials"
    Write-Host "FATAL: Cannot continue without AWS auth"
    exit 1
}

# ── 2. EC2 Instances ─────────────────────────────────────────
Write-Host ""
Write-Host "--- EC2 Instances ---"
$instances = aws ec2 describe-instances --region $Region `
    --filters "Name=tag:Project,Values=$Project" `
    --query "Reservations[*].Instances[*].{ID:InstanceId,Name:Tags[?Key=='Name']|[0].Value,State:State.Name,Role:Tags[?Key=='Role']|[0].Value}" `
    --output json | ConvertFrom-Json | ForEach-Object { $_ } | ForEach-Object { $_ }

$runningCount = 0
foreach ($inst in $instances) {
    if ($inst.State -eq "running") {
        $runningCount++
        Check "EC2 $($inst.Name)" "pass" "$($inst.ID) state=$($inst.State) role=$($inst.Role)"
    } else {
        Check "EC2 $($inst.Name)" "fail" "$($inst.ID) state=$($inst.State) role=$($inst.Role)"
    }
}

if ($runningCount -eq 0) {
    Check "EC2 Total" "fail" "No running instances found with Project=$Project tag"
} else {
    Check "EC2 Total" "pass" "$runningCount instance(s) running"
}

# ── 3. ECR Images ────────────────────────────────────────────
Write-Host ""
Write-Host "--- ECR Images ---"
try {
    $images = aws ecr list-images --region $Region --repository-name $ECR_NODE_REPO --output json | ConvertFrom-Json
    $count = $images.imageIds.Count
    if ($count -gt 0) {
        Check "ECR node image" "pass" "$count image(s) in $ECR_NODE_REPO"
        foreach ($img in $images.imageIds) { Write-Host "  $($img.imageTag) $($img.imageDigest)" }
    } else {
        Check "ECR node image" "fail" "EMPTY — no images in $ECR_NODE_REPO — runtime cannot start"
    }
} catch {
    Check "ECR node image" "fail" "Cannot check ECR: $_"
}

# ── 4. NLB / Load Balancers ──────────────────────────────────
Write-Host ""
Write-Host "--- Load Balancers ---"
try {
    $lbs = aws elbv2 describe-load-balancers --region $Region --output json | ConvertFrom-Json
    $nlb = $lbs.LoadBalancers | Where-Object { $_.LoadBalancerName -match "nlb" }
    $alb = $lbs.LoadBalancers | Where-Object { $_.Type -eq "application" }

    if ($nlb) {
        Check "NLB" "pass" "$($nlb.LoadBalancerName) state=$($nlb.State.Code) dns=$($nlb.DNSName)"
    } else {
        Check "NLB" "fail" "NLB not found"
    }

    if ($alb) {
        Check "ALB" "pass" "$($alb.LoadBalancerName) state=$($alb.State.Code)"
    } else {
        Check "ALB" "warn" "ALB not deployed — dashboard has no public endpoint"
    }
} catch {
    Check "Load Balancers" "fail" "Cannot check LBs: $_"
}

# ── 5. Target Group Health ────────────────────────────────────
Write-Host ""
Write-Host "--- Target Group Health ---"
try {
    $tgArn = aws elbv2 describe-target-groups --region $Region --names $NLB_TG_NAME `
        --query "TargetGroups[0].TargetGroupArn" --output text
    $health = aws elbv2 describe-target-health --region $Region --target-group-arn $tgArn --output json | ConvertFrom-Json

    foreach ($t in $health.TargetHealthDescriptions) {
        $state = $t.TargetHealth.State
        $reason = $t.TargetHealth.Reason
        if ($state -eq "healthy") {
            Check "TG $NLB_TG_NAME $($t.Target.Id):$($t.Target.Port)" "pass" "healthy"
        } else {
            Check "TG $NLB_TG_NAME $($t.Target.Id):$($t.Target.Port)" "fail" "state=$state reason=$reason"
        }
    }
} catch {
    Check "Target Group Health" "fail" "Cannot check: $_"
}

# ── 6. Route53 DNS Resolution ────────────────────────────────
Write-Host ""
Write-Host "--- Route53 / DNS ---"
try {
    $records = aws route53 list-resource-record-sets --hosted-zone-id $HOSTED_ZONE `
        --query "ResourceRecordSets[?Name=='rpc.l1.unykorn.org.']" --output json | ConvertFrom-Json
    if ($records.Count -gt 0) {
        Check "Route53 rpc.l1.unykorn.org" "pass" "Record exists type=$($records[0].Type)"
    } else {
        Check "Route53 rpc.l1.unykorn.org" "fail" "No DNS record found"
    }
} catch {
    Check "Route53" "fail" "Cannot check: $_"
}

# DNS resolution test (requires nslookup)
try {
    $resolve = nslookup $RPC_DNS 2>&1 | Select-String "Address" | Select-Object -Last 1
    if ($resolve) {
        Check "DNS resolve $RPC_DNS" "pass" $resolve.ToString().Trim()
    } else {
        Check "DNS resolve $RPC_DNS" "warn" "Could not resolve — check NS delegation"
    }
} catch {
    Check "DNS resolve $RPC_DNS" "warn" "nslookup failed: $_"
}

# ── 7. SSM Reachability ──────────────────────────────────────
Write-Host ""
Write-Host "--- SSM Instance Reachability ---"
try {
    $ssmInstances = aws ssm describe-instance-information --region $Region `
        --query "InstanceInformationList[*].{ID:InstanceId,Ping:PingStatus}" `
        --output json 2>&1 | ConvertFrom-Json

    foreach ($si in $ssmInstances.InstanceInformationList) {
        if ($si.Ping -eq "Online") {
            Check "SSM $($si.ID)" "pass" "ping=Online"
        } else {
            Check "SSM $($si.ID)" "warn" "ping=$($si.Ping)"
        }
    }
} catch {
    Check "SSM" "warn" "Cannot check SSM status: $_"
}

# ── 8. CloudWatch Log Groups ─────────────────────────────────
Write-Host ""
Write-Host "--- CloudWatch Log Groups ---"
try {
    $logGroups = aws logs describe-log-groups --region $Region `
        --log-group-name-prefix "/unykorn" `
        --query "logGroups[*].{Name:logGroupName,Retention:retentionInDays}" `
        --output json | ConvertFrom-Json
    foreach ($lg in $logGroups) {
        Check "CW LogGroup $($lg.Name)" "pass" "retention=$($lg.Retention)d"
    }
    if ($logGroups.Count -eq 0) {
        Check "CW LogGroups" "warn" "No /unykorn log groups found"
    }
} catch {
    Check "CloudWatch" "warn" "Cannot check log groups: $_"
}

# ── Summary ──────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================"
Write-Host "  SUMMARY"
Write-Host "============================================================"
$pass  = ($results | Where-Object { $_.Status -eq "pass"  }).Count
$fail  = ($results | Where-Object { $_.Status -eq "fail"  }).Count
$warn  = ($results | Where-Object { $_.Status -eq "warn"  }).Count
Write-Host "  $PASS  $pass checks passed"
Write-Host "  $FAIL  $fail checks FAILED"
Write-Host "  $WARN  $warn warnings"
Write-Host ""

if ($fail -gt 0) {
    Write-Host "FAILED CHECKS:"
    $results | Where-Object { $_.Status -eq "fail" } | ForEach-Object {
        Write-Host "  - $($_.Check): $($_.Detail)"
    }
}
Write-Host "============================================================"
