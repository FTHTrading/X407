#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Checks NLB and ALB target group health for all UnyKorn L1 targets.

.DESCRIPTION
  Queries all UnkyKorn target groups and reports health status.
  Polls until healthy or timeout.

.PARAMETER Region
  AWS region. Default: us-east-1

.PARAMETER Wait
  If set, polls every 10 seconds until all targets are healthy or timeout is reached.

.PARAMETER TimeoutSeconds
  How long to poll when -Wait is set. Default: 300 (5 minutes).

.EXAMPLE
  .\check-target-health.ps1
  .\check-target-health.ps1 -Wait -TimeoutSeconds 120
#>

param(
    [string]$Region         = "us-east-1",
    [switch]$Wait,
    [int]$TimeoutSeconds    = 300,
    [int]$PollIntervalSecs  = 10
)

$ErrorActionPreference = "Stop"

$PROJECT = "unykorn-l1-devnet"

function Get-TargetHealth {
    $tgs = aws elbv2 describe-target-groups --region $Region `
        --output json 2>&1 | ConvertFrom-Json

    $results = @()
    foreach ($tg in $tgs.TargetGroups) {
        $name = $tg.TargetGroupName
        if ($name -notmatch $PROJECT) { continue }

        $health = aws elbv2 describe-target-health --region $Region `
            --target-group-arn $tg.TargetGroupArn --output json | ConvertFrom-Json

        foreach ($t in $health.TargetHealthDescriptions) {
            $results += [PSCustomObject]@{
                TG       = $name
                Target   = "$($t.Target.Id):$($t.Target.Port)"
                Protocol = $tg.Protocol
                State    = $t.TargetHealth.State
                Reason   = $t.TargetHealth.Reason
                Desc     = $t.TargetHealth.Description
            }
        }
    }
    return $results
}

function Print-Results {
    param($results, $timestamp)
    Write-Host ""
    Write-Host "=== Target Health @ $timestamp ==="
    $results | Format-Table -AutoSize
}

Write-Host "============================================================"
Write-Host "  UnyKorn L1 — Target Group Health Check"
Write-Host "  Region: $Region"
Write-Host "============================================================"

if (-not $Wait) {
    $r = Get-TargetHealth
    Print-Results $r (Get-Date -Format 'HH:mm:ss')

    $unhealthy = $r | Where-Object { $_.State -ne "healthy" }
    if ($unhealthy) {
        Write-Host "UNHEALTHY TARGETS:"
        $unhealthy | ForEach-Object {
            Write-Host "  $($_.TG) — $($_.Target) — $($_.State) — $($_.Reason)"
        }
        Write-Host ""
        Write-Host "Root cause checklist:"
        Write-Host "  1. Is ECR node image pushed? Run: aws ecr list-images --repository-name unykorn-l1/node --region $Region"
        Write-Host "  2. Is the Docker container running on the EC2 instance?"
        Write-Host "     SSM in: aws ssm start-session --target <instance-id> --region $Region"
        Write-Host "     Then: docker ps; docker logs unykorn-alpha"
        Write-Host "  3. Is port 3001 listening? ss -tlnp | grep 3001"
        Write-Host "  4. Is the security group allowing NLB to reach the node?"
        exit 1
    } else {
        Write-Host "All targets HEALTHY"
        exit 0
    }
} else {
    Write-Host "Polling with timeout=${TimeoutSeconds}s interval=${PollIntervalSecs}s"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $r = Get-TargetHealth
        Print-Results $r (Get-Date -Format 'HH:mm:ss')

        $unhealthy = $r | Where-Object { $_.State -ne "healthy" }
        if (-not $unhealthy) {
            Write-Host ""
            Write-Host "ALL TARGETS HEALTHY"
            exit 0
        }

        $remaining = [math]::Round(($deadline - (Get-Date)).TotalSeconds)
        Write-Host "$($unhealthy.Count) unhealthy target(s). Retrying in ${PollIntervalSecs}s (${remaining}s remaining)..."
        Start-Sleep -Seconds $PollIntervalSecs
    }

    Write-Host ""
    Write-Host "TIMEOUT after ${TimeoutSeconds}s. Targets still unhealthy."
    Get-TargetHealth | Where-Object { $_.State -ne "healthy" } | Format-Table -AutoSize
    exit 1
}
