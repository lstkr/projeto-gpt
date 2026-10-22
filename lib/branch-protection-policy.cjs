'use strict';
const CHECKS=Object.freeze([
  "build",
  "tests",
  "Fiscal integrity / PostgreSQL 15",
  "Fiscal integrity / PostgreSQL 17",
  "Native session / PostgreSQL 15",
  "Native session / PostgreSQL 17",
  "Tenant isolation / PostgreSQL 15",
  "Tenant isolation / PostgreSQL 17",
  "Adversarial auth / API / regression",
  "Vulnerabilities, secrets and configuration",
  "PostgreSQL attack lab / fiscal",
  "PostgreSQL attack lab / session",
  "PostgreSQL attack lab / multi-tenant"
]);
function payload(reviews=0){
 if(!Number.isInteger(reviews)||reviews<0||reviews>6)throw new RangeError('Revisões 0..6');
 return {required_status_checks:{strict:true,contexts:[...CHECKS]},
 enforce_admins:true,
 required_pull_request_reviews:{dismiss_stale_reviews:true,require_code_owner_reviews:false,required_approving_review_count:reviews},
 restrictions:null,required_linear_history:true,allow_force_pushes:false,allow_deletions:false,
 required_conversation_resolution:true,lock_branch:false,allow_fork_syncing:false};
}
module.exports={CHECKS,payload};
