# ─────────────────────────────────────────────────────────────
# Staging Environment — UnyKorn L1
# Smaller instances, same topology
# ─────────────────────────────────────────────────────────────

aws_region          = "us-east-1"
project_name        = "unykorn-l1"
environment         = "staging"
vpc_cidr            = "10.101.0.0/16"
availability_zones  = ["us-east-1a", "us-east-1b"]

admin_cidr          = ["0.0.0.0/0"]  # CHANGE: restrict to your IP/32

node_key_pair       = "unykorn-staging-key"
node_ami_id         = ""
certificate_arn     = ""
domain_name         = "staging.l1.unykorn.org"
hosted_zone_id      = ""

# Staging uses smaller instances to save cost
chain_nodes = {
  alpha = {
    role          = "producer"
    instance_type = "c6a.large"
    volume_size   = 100
    rpc_port      = 3001
    p2p_port      = 30301
    az_index      = 0
  }
  bravo = {
    role          = "validator"
    instance_type = "c6a.large"
    volume_size   = 100
    rpc_port      = 3002
    p2p_port      = 30302
    az_index      = 0
  }
  charlie = {
    role          = "validator"
    instance_type = "c6a.large"
    volume_size   = 100
    rpc_port      = 3003
    p2p_port      = 30303
    az_index      = 1
  }
  delta = {
    role          = "oracle"
    instance_type = "t3.medium"
    volume_size   = 50
    rpc_port      = 3004
    p2p_port      = 30304
    az_index      = 0
  }
  echo = {
    role          = "oracle"
    instance_type = "t3.medium"
    volume_size   = 50
    rpc_port      = 3005
    p2p_port      = 30305
    az_index      = 1
  }
}
