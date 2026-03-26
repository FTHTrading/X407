# UnyKorn L1 — Operational Runbook

> **Environment:** AWS Devnet / Institutional Proof
> **Chain ID:** 7331
> **Block Time:** 3 seconds

---

## Quick Reference

| What              | Where                                          |
|-------------------|------------------------------------------------|
| Dashboard         | `https://l1.unykorn.org`                       |
| RPC Endpoint      | `https://rpc.l1.unykorn.org:3001`              |
| Grafana           | `https://grafana.l1.unykorn.org`               |
| CloudWatch        | AWS Console → CloudWatch → Dashboards → `unykorn-l1-devnet` |
| Node Logs         | CloudWatch → Log Groups → `/unykorn/<node>`    |
| Terraform State   | `aws/terraform/` (local, or S3 after migration)|
| Secrets           | AWS Secrets Manager → `unykorn/*`              |
| ECR Images        | ECR → `unykorn-l1/node`, `unykorn-l1/dashboard`|
| S3 Snapshots      | `unykorn-l1-devnet-snapshots`                  |

---

## 1. Daily Operations

### Check Node Health
```bash
# Via SSH/SSM to any node
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Via RPC
curl -s http://rpc.l1.unykorn.org:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"unykorn_getValidatorList","params":[],"id":1}' | jq
```

### Check Staking Stats
```bash
curl -s http://rpc.l1.unykorn.org:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"unykorn_getStakingStats","params":[],"id":1}' | jq
```

### Check Trade Finance Stats
```bash
curl -s http://rpc.l1.unykorn.org:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"unykorn_getTradeFinanceStats","params":[],"id":1}' | jq
```

---

## 2. Node Management

### Restart a Node
```bash
# Via SSM Session Manager
aws ssm start-session --target <instance-id>

# On the node
docker restart unykorn-<node_name>
docker logs unykorn-<node_name> --tail 50
```

### Update Node Image
```bash
# Build and push
cd aws/
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/unykorn-l1/node"

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR
docker build -f docker/Dockerfile.node -t unykorn-node:latest ../../
docker tag unykorn-node:latest ${ECR}:latest
docker push ${ECR}:latest

# On each node (via SSM)
docker pull ${ECR}:latest
docker stop unykorn-<node>
docker rm unykorn-<node>
# Re-run the container (same args as bootstrap)
```

### Rolling Node Update
Update nodes one at a time, waiting for the node to rejoin consensus:
1. Update `echo` (oracle) → verify quorum
2. Update `delta` (oracle) → verify quorum
3. Update `charlie` (validator) → verify block production
4. Update `bravo` (validator) → verify block production
5. Update `alpha` (producer) → verify chain continues

---

## 3. Snapshot Management

### Create Snapshot
```bash
# On the node
docker stop unykorn-<node>
tar czf /tmp/snapshot-$(date +%Y%m%d).tar.gz -C /data/unykorn .
aws s3 cp /tmp/snapshot-$(date +%Y%m%d).tar.gz \
  s3://unykorn-l1-devnet-snapshots/<node>/
docker start unykorn-<node>
```

### Restore from Snapshot
```bash
docker stop unykorn-<node>
rm -rf /data/unykorn/{blocks,state,meta}/*
aws s3 cp s3://unykorn-l1-devnet-snapshots/<node>/snapshot-YYYYMMDD.tar.gz /tmp/
tar xzf /tmp/snapshot-YYYYMMDD.tar.gz -C /data/unykorn
docker start unykorn-<node>
```

---

## 4. Secrets Rotation

### Rotate Node Keys
```bash
# Generate new keys
NEW_KEYS=$(jq -n '{
  alpha: "'$(openssl rand -hex 32)'",
  bravo: "'$(openssl rand -hex 32)'",
  charlie: "'$(openssl rand -hex 32)'",
  delta: "'$(openssl rand -hex 32)'",
  echo: "'$(openssl rand -hex 32)'"
}')

# Update Secrets Manager
aws secretsmanager update-secret \
  --secret-id unykorn/l1/node-keys \
  --secret-string "$NEW_KEYS"

# Then restart all nodes with new keys (rolling update)
```

### Rotate RPC API Key
```bash
NEW_KEY=$(openssl rand -base64 32)
aws secretsmanager update-secret \
  --secret-id unykorn/l1/rpc-api-key \
  --secret-string "{\"api_key\": \"$NEW_KEY\"}"
```

---

## 5. Infrastructure Changes

### Terraform Workflow
```bash
cd aws/terraform

# Plan changes
terraform plan -var-file=environments/devnet.tfvars -out=tfplan

# Review carefully, then apply
terraform apply tfplan

# Check state
terraform state list
terraform output
```

### Scale a Node
Edit `environments/devnet.tfvars`:
```hcl
chain_nodes = {
  alpha = {
    instance_type = "c6a.2xlarge"  # was c6a.xlarge
    ...
  }
}
```
Then `terraform plan` + `terraform apply`. The node will be replaced.

### Add a New Node
Add entry to `chain_nodes` map in tfvars, add security group rules for new ports, apply.

---

## 6. Monitoring & Alerts

### CloudWatch Alarms (pre-configured)
- **CPU > 85%** for 15 minutes → alarm per node
- **Status check failed** → immediate alarm per node

### Custom Metrics (push from nodes)
- `UnyKorn/L1/BlockHeight` — current block number
- `UnyKorn/L1/TransactionsPerSecond` — TPS
- `UnyKorn/L1/PeerCount` — connected peers
- `UnyKorn/L1/MempoolSize` — pending transactions

### Grafana Dashboards
Access via `https://grafana.l1.unykorn.org` (AWS SSO auth).
Pre-configured data sources: AMP (Prometheus), CloudWatch.

---

## 7. Incident Response

### Node Down
1. Check CloudWatch alarm
2. Check EC2 instance status: `aws ec2 describe-instance-status --instance-ids <id>`
3. If instance healthy but container down: SSM → `docker restart unykorn-<node>`
4. If instance unhealthy: `aws ec2 reboot-instances --instance-ids <id>`
5. If instance unreachable: terminate and let Terraform recreate

### Chain Stalled (no new blocks)
1. Check `alpha` (producer) — is it running?
2. Check validator quorum — are bravo+charlie both up?
3. Check oracle quorum — are delta+echo both up?
4. Check P2P connectivity between nodes (security groups, network ACLs)
5. Check disk space: `df -h /data/unykorn`

### High CPU / Memory
1. Check `docker stats` on affected node
2. Check if mempool is flooded: RPC → `unykorn_getStakingStats`
3. Consider vertical scaling (larger instance type)
4. Check for log storms: `du -sh /var/log/unykorn/`

### Disk Full
1. Prune old Docker images: `docker system prune -f`
2. Archive old snapshots to S3
3. Check log rotation
4. Consider expanding EBS volume (online resize supported for gp3)

---

## 8. Backup & Recovery

### EBS Snapshots (automated)
```bash
# Create EBS snapshot
VOLUME_ID=$(aws ec2 describe-instances \
  --instance-ids <id> \
  --query "Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId" \
  --output text)

aws ec2 create-snapshot \
  --volume-id $VOLUME_ID \
  --description "unykorn-l1-<node>-$(date +%Y%m%d)" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=unykorn-l1-<node>}]"
```

### Full Chain Recovery
1. Stop all nodes
2. Restore `alpha` from latest snapshot
3. Start `alpha` and verify chain state
4. Start validators (bravo, charlie)
5. Start oracles (delta, echo)
6. Verify consensus resumes

---

## 9. Cost Management

### Check Current Spend
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter '{"Tags":{"Key":"Project","Values":["UnyKorn-L1"]}}' \
  --output table
```

### Stop Devnet (save costs overnight)
```bash
# Stop all nodes
for node in alpha bravo charlie delta echo; do
  INSTANCE_ID=$(cd aws/terraform && terraform output -json node_instance_ids | jq -r ".${node}")
  aws ec2 stop-instances --instance-ids $INSTANCE_ID
done

# Start all nodes
for node in alpha bravo charlie delta echo; do
  INSTANCE_ID=$(cd aws/terraform && terraform output -json node_instance_ids | jq -r ".${node}")
  aws ec2 start-instances --instance-ids $INSTANCE_ID
done
```

---

## 10. Security Checklist

- [ ] `admin_cidr` restricted to known IPs (not 0.0.0.0/0)
- [ ] All secrets moved to Secrets Manager (no plaintext files)
- [ ] IMDSv2 enforced on all EC2 instances
- [ ] EBS volumes encrypted with KMS
- [ ] S3 buckets: public access blocked, versioning enabled
- [ ] WAF enabled on ALB
- [ ] VPC flow logs enabled
- [ ] CloudTrail enabled (account-level)
- [ ] Node keys rotated from placeholder values
- [ ] SSH key pair stored securely (not in repo)
- [ ] GuardDuty enabled (Phase 2)
- [ ] Security Hub enabled (Phase 2)
