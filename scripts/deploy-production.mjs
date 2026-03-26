#!/usr/bin/env node
// deploy-production.mjs
// ─────────────────────────────────────────────────────────
// Builds Docker images for facilitator, treasury, guardian
// and pushes them to ECR. Optionally deploys to AWS via SSM.
// ─────────────────────────────────────────────────────────
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const AWS_ACCOUNT = '933629770808';
const AWS_REGION  = 'us-east-1';
const ECR_BASE    = `${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com`;
const SERVICES    = ['facilitator', 'treasury', 'guardian'];
const TAG         = process.argv[2] || `build-${Date.now()}`;

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCKER_DIR = path.join(ROOT, 'aws', 'docker');

// ── Helpers ─────────────────────────────────────────────
function run(cmd, opts = {}) {
  console.log(`\n  ▸ ${cmd}`);
  try {
    return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
  } catch (err) {
    if (!opts.ignoreErrors) {
      console.error(`\n  ✖ Command failed: ${cmd}`);
      process.exit(1);
    }
  }
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

// ── Step 1: ECR Login ───────────────────────────────────
console.log('\n═══ Step 1: ECR Login ═══');
run(`aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_BASE}`);

// ── Step 2: Ensure ECR Repos Exist ──────────────────────
console.log('\n═══ Step 2: Ensure ECR Repositories ═══');
for (const svc of SERVICES) {
  const repo = `unykorn-l1/${svc}`;
  try {
    runCapture(`aws ecr describe-repositories --repository-names ${repo} --region ${AWS_REGION}`);
    console.log(`  ✓ ${repo} already exists`);
  } catch {
    console.log(`  → Creating ${repo}...`);
    run(`aws ecr create-repository --repository-name ${repo} --region ${AWS_REGION} --image-scanning-configuration scanOnPush=true --encryption-configuration encryptionType=AES256`);
  }
}

// ── Step 3: Build Images ────────────────────────────────
console.log('\n═══ Step 3: Build Docker Images ═══');
for (const svc of SERVICES) {
  const dockerfile = path.join(DOCKER_DIR, `Dockerfile.${svc}`);
  if (!existsSync(dockerfile)) {
    console.error(`  ✖ Missing: ${dockerfile}`);
    process.exit(1);
  }
  const fullTag = `${ECR_BASE}/unykorn-l1/${svc}:${TAG}`;
  const latestTag = `${ECR_BASE}/unykorn-l1/${svc}:latest`;
  run(`docker build -f ${dockerfile} -t ${fullTag} -t ${latestTag} .`);
}

// ── Step 4: Push Images ─────────────────────────────────
console.log('\n═══ Step 4: Push Images to ECR ═══');
for (const svc of SERVICES) {
  const fullTag = `${ECR_BASE}/unykorn-l1/${svc}:${TAG}`;
  const latestTag = `${ECR_BASE}/unykorn-l1/${svc}:latest`;
  run(`docker push ${fullTag}`);
  run(`docker push ${latestTag}`);
}

// ── Step 5: Summary ─────────────────────────────────────
console.log('\n═══ Deployment Summary ═══');
console.log(`  Tag:     ${TAG}`);
console.log(`  Images:`);
for (const svc of SERVICES) {
  console.log(`    • ${ECR_BASE}/unykorn-l1/${svc}:${TAG}`);
}

// ── Step 6: Optional SSM Deploy ─────────────────────────
const DEPLOY_FLAG = process.argv.includes('--deploy');
if (DEPLOY_FLAG) {
  console.log('\n═══ Step 6: Deploy to AWS via SSM ═══');

  // We deploy facilitator + treasury + guardian to the delta instance (oracle-1)
  // which has the most headroom. Production would use dedicated instances.
  const TARGET_INSTANCE = 'i-0e9a24f4902faaa06'; // delta

  const deployCmd = [
    `#!/bin/bash`,
    `set -e`,
    `aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_BASE}`,
    `docker pull ${ECR_BASE}/unykorn-l1/facilitator:${TAG}`,
    `docker pull ${ECR_BASE}/unykorn-l1/treasury:${TAG}`,
    `docker pull ${ECR_BASE}/unykorn-l1/guardian:${TAG}`,
    `# Stop existing if running`,
    `docker stop fth-facilitator fth-treasury fth-guardian 2>/dev/null || true`,
    `docker rm fth-facilitator fth-treasury fth-guardian 2>/dev/null || true`,
    `# Start postgres if not running`,
    `docker start fth-postgres 2>/dev/null || docker run -d --name fth-postgres \\`,
    `  -e POSTGRES_DB=fth_x402 -e POSTGRES_USER=fth_x402_app -e POSTGRES_PASSWORD=\${POSTGRES_PASSWORD} \\`,
    `  -p 5432:5432 --restart unless-stopped postgres:16-alpine`,
    `sleep 5`,
    `# Start services`,
    `docker run -d --name fth-facilitator --restart unless-stopped \\`,
    `  -e DATABASE_URL=postgresql://fth_x402_app:\${POSTGRES_PASSWORD}@localhost:5432/fth_x402 \\`,
    `  -e FTH_SIGNING_KEY=\${FTH_SIGNING_KEY} \\`,
    `  -e UNYKORN_RPC_URL=http://localhost:3001 \\`,
    `  --network host \\`,
    `  ${ECR_BASE}/unykorn-l1/facilitator:${TAG}`,
    `docker run -d --name fth-treasury --restart unless-stopped \\`,
    `  -e DATABASE_URL=postgresql://fth_x402_app:\${POSTGRES_PASSWORD}@localhost:5432/fth_x402 \\`,
    `  -e TREASURY_MASTER_KEY=\${TREASURY_MASTER_KEY} \\`,
    `  -e UNYKORN_RPC_URL=http://localhost:3001 \\`,
    `  --network host \\`,
    `  ${ECR_BASE}/unykorn-l1/treasury:${TAG}`,
    `docker run -d --name fth-guardian --restart unless-stopped \\`,
    `  -e DATABASE_URL=postgresql://fth_x402_app:\${POSTGRES_PASSWORD}@localhost:5432/fth_x402 \\`,
    `  -e GUARDIAN_API_KEY=\${GUARDIAN_API_KEY} \\`,
    `  -e UNYKORN_RPC_URL=http://localhost:3001 \\`,
    `  -e AWS_DEFAULT_REGION=${AWS_REGION} \\`,
    `  --network host \\`,
    `  ${ECR_BASE}/unykorn-l1/guardian:${TAG}`,
    `echo "Deploy complete — all services running"`,
  ].join('\n');

  const ssmParams = JSON.stringify({
    commands: [deployCmd],
  });

  // Write SSM command to temp file to avoid shell escaping issues
  const ssmFile = path.join(ROOT, '.tmp-ssm-deploy.json');
  require('fs').writeFileSync(ssmFile, ssmParams);

  console.log(`  → Sending deploy command to ${TARGET_INSTANCE}...`);
  run(`aws ssm send-command --instance-ids ${TARGET_INSTANCE} --document-name "AWS-RunShellScript" --parameters file://${ssmFile} --region ${AWS_REGION}`);

  console.log('\n  ✓ Deploy command sent. Check SSM console for status.');
} else {
  console.log('\n  Tip: Run with --deploy to auto-deploy to AWS via SSM');
  console.log('       node scripts/deploy-production.mjs --deploy');
}

console.log('\n═══ Done ═══\n');
