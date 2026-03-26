# ROLLBACK AND PRESERVE PLAN — UnyKorn L1
**Date:** 2026-03-18  
**Account:** 933629770808 | Region: us-east-1

---

## How to Preserve Current Infrastructure

The 5 EC2 instances are running and costing money. Before making any changes, snapshot the current state.

### Step 1 — Back up Terraform State

```powershell
$TF_DIR = "C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unyKorn-master\aws\terraform"
$BACKUP  = "$TF_DIR\terraform.tfstate.backup-$(Get-Date -Format 'yyyyMMdd-HHmm')"
Copy-Item "$TF_DIR\terraform.tfstate" $BACKUP
Write-Host "State backed up to $BACKUP"
```

Also copy the state backup to a safe location outside the repo (e.g., USB or OneDrive subfolder) before running *any* apply.

### Step 2 — Tag Resources for Preservation

All 5 instances already have `Project=UnyKorn-L1` tags. Before changes, add a timestamp:
```powershell
aws ec2 create-tags --region us-east-1 `
  --resources i-083a36c8ce027de55 i-0608a0ebab4d97d79 i-0d87f793231da3772 i-0e9a24f4902faaa06 i-0d9493de789fc744a `
  --tags Key=BackupDate,Value=$(Get-Date -Format 'yyyy-MM-dd') `
         Key=PreserveReason,Value=PreApplySnapshot
```

### Step 3 — EBS Snapshot Before Any Apply

```powershell
# Get all EBS volumes attached to chain nodes
$volumes = aws ec2 describe-volumes --region us-east-1 `
    --filters "Name=attachment.instance-id,Values=i-083a36c8ce027de55,i-0608a0ebab4d97d79,i-0d87f793231da3772,i-0e9a24f4902faaa06,i-0d9493de789fc744a" `
    --query "Volumes[*].VolumeId" --output text

foreach ($vol in ($volumes -split '\s+')) {
    aws ec2 create-snapshot --region us-east-1 --volume-id $vol `
        --description "pre-apply-backup-$(Get-Date -Format 'yyyyMMdd')" 2>&1
    Write-Host "Snapshotting $vol"
}
```

---

## How to Stop Cost Bleed Safely

EC2 instances (`c6a.xlarge` × 3) + (`c6a.large` × 2) + NLB incur ~$400–500/month.  
If you need to stop cost while preserving the ability to restart:

### Option A — Stop EC2 Instances (Data Preserved, EBS Retained)

```powershell
aws ec2 stop-instances --region us-east-1 --instance-ids `
    i-083a36c8ce027de55 `
    i-0608a0ebab4d97d79 `
    i-0d87f793231da3772 `
    i-0e9a24f4902faaa06 `
    i-0d9493de789fc744a
```

**Effect:**
- Compute cost stops (~$0.174/hr per xlarge, ~$0.087/hr per large)
- EBS volumes continue to bill (gp3 200GB × 3 + 100GB × 2 ≈ $70/mo)
- NLB continues to bill (~$16/mo + LCU charges)
- Data is preserved
- Instances restart without user_data re-run (user_data runs only on first boot)

**To restart:**
```powershell
aws ec2 start-instances --region us-east-1 --instance-ids `
    i-083a36c8ce027de55 `
    i-0608a0ebab4d97d79 `
    i-0d87f793231da3772 `
    i-0e9a24f4902faaa06 `
    i-0d9493de789fc744a
```

### Option B — Terraform Destroy (DESTRUCTIVE — data lost)

> ⚠ **DO NOT RUN WITHOUT EXPLICIT APPROVAL**

If you need to fully tear down (e.g., to reprovisioning from scratch):
```powershell
Set-Location "C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unyKorn-master\aws\terraform"
# Backup state first (see above)
terraform destroy -var-file=terraform.tfvars
```

This will destroy all 82 resources tracked in state. EC2 volumes have `delete_on_termination = false` in Terraform, so EBS volumes **should** survive a destroy but **verify** before proceeding.

---

## How to Revert Security Group / Listener / Bootstrap Changes

### Revert SG Rule Change

If an apply changes a security group rule unintentionally:
1. Check what changed: `terraform plan` will show `~ update` on the SG resource
2. To revert a CIDR change made manually in AWS Console (out of band):
   ```bash
   # Remove the bad rule
   aws ec2 revoke-security-group-ingress --region us-east-1 \
       --group-id sg-09dbed63f0daa595d \
       --protocol tcp --port 22 \
       --cidr 0.0.0.0/0
   # Re-add the correct rule
   aws ec2 authorize-security-group-ingress --region us-east-1 \
       --group-id sg-09dbed63f0daa595d \
       --protocol tcp --port 22 \
       --cidr 76.230.229.105/32
   ```
3. Then run `terraform apply` to bring state back in sync.

### Revert a Failed Bootstrap

If a node bootstrap script corrupts the node config:
1. Connect via SSM: `aws ssm start-session --target <instance-id> --region us-east-1`
2. Stop the container: `docker stop unykorn-alpha && docker rm unykorn-alpha`
3. Remove the bad config: `rm /data/unykorn/node.toml`
4. Re-run the bootstrap script from `ops/scripts/bootstrap-node-runtime.sh`

### Revert a Bad Docker Push to ECR

If a broken image is pushed to ECR:
```powershell
# List images to find the bad digest
aws ecr list-images --region us-east-1 --repository-name "unykorn-l1/node"

# Delete the bad image tag
aws ecr batch-delete-image --region us-east-1 `
    --repository-name "unykorn-l1/node" `
    --image-ids imageTag=latest
```

Then push the known-good image.

### Revert a Terraform State Corruption

If state is corrupted after a failed apply:
```powershell
# Use the backup created before apply
$TF_DIR  = "C:\Users\Kevan\OneDrive - FTH Trading\02-UnyKorn\unyKorn-master\aws\terraform"
$BACKUP  = "$TF_DIR\terraform.tfstate.backup-YYYYMMDD-HHMM"  # your backup file
terraform state rm <resource>  # if needed to remove phantom state
Copy-Item $BACKUP "$TF_DIR\terraform.tfstate"
```

---

## Remote State Migration (Recommended — Do Not Do Automatically)

Before the next major apply, consider migrating to remote state to enable locking.

### Prerequisites
1. An S3 bucket must exist: `unykorn-terraform-state`
2. A DynamoDB table must exist: `unykorn-terraform-locks`

The S3 bucket is referenced in the commented-out backend block in `main.tf`:
```hcl
# backend "s3" {
#   bucket         = "unykorn-terraform-state"
#   key            = "l1/devnet/terraform.tfstate"
#   region         = "us-east-1"
#   encrypt        = true
#   dynamodb_table = "unykorn-terraform-locks"
# }
```

### Migration Steps (AFTER approving)
1. Create the S3 bucket and DynamoDB table (separate Terraform workspace or manual AWS CLI)
2. Backup local state (see above)
3. Uncomment the backend block in `main.tf`
4. Run `terraform init -migrate-state`
5. Confirm migration prompt with `yes`
6. Delete the local `terraform.tfstate` only after confirming the remote state contains all 82 resources

> ⚠ Do not do this unilaterally. Coordinate with anyone who may be running `terraform apply`.

---

## Cost Summary (Current Monthly Estimate)

| Resource | Qty | Type | Est. Cost/mo |
|----------|-----|------|-------------|
| EC2 c6a.xlarge (running) | 3 | Compute | ~$190 |
| EC2 c6a.large (running) | 2 | Compute | ~$63 |
| EBS gp3 200GB | 3 | Storage | ~$48 |
| EBS gp3 100GB | 2 | Storage | ~$16 |
| NLB (active) | 1 | LB | ~$16 |
| NAT Gateway | 1–2 | Network | ~$32–64 |
| ECR repos (empty) | 2 | Storage | ~$0 |
| Secrets Manager | ~5 secrets | Managed | ~$2 |
| **Total estimate** | | | **~$370–400/mo** |

Stopping all 5 instances reduces to ~$100/mo (EBS + NLB + NAT).
