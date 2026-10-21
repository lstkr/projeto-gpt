'use strict';
// Detects main commits without an associated merged PR. This runs AFTER a push.
// It is not a substitute for provider-enforced branch protection.
const assert = require('node:assert/strict');

function isMergedPrForBranch(pulls, branch = 'main') {
  return Array.isArray(pulls) && pulls.some(pr =>
    pr && pr.merged_at && pr.base?.ref === branch
  );
}

async function verify({repo, sha, token, fetchImpl = fetch}) {
  assert.match(repo, /^[\w.-]+\/[\w.-]+$/, 'Valid repo required');
  assert.match(sha, /^[a-f0-9]{40}$/i, 'Complete commit SHA required');
  assert.ok(token, 'A GitHub token with pull-requests: read is required');
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/commits/${sha}/pulls?per_page=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'estoque-main-provenance-check'
      },
      signal: AbortSignal.timeout(15000)
    }
  );
  if (!response.ok) throw new Error(`GitHub PR association query returned HTTP ${response.status}`);
  const pulls = await response.json();
  if (!isMergedPrForBranch(pulls)) {
    throw new Error(`Commit ${sha.slice(0, 8)} lacks a merged PR into main.\n` +
      'This check only detects direct pushes after the fact. ' +
      'Enable paid private-branch protection to PREVENT them.');
  }
  console.log(`OK: ${sha.slice(0, 8)} originated from a merged main pull request`);
}

if (require.main === module) {
  verify({
    repo: process.env.GITHUB_REPOSITORY,
    sha: process.env.ESTOQUE_VERIFY_SHA || process.env.GITHUB_SHA,
    token: process.env.GH_TOKEN
  }).catch(error => { console.error('::error::' + error.message); process.exitCode = 1; });
}

module.exports = {isMergedPrForBranch, verify};
