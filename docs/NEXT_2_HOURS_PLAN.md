# Syntreature: Next 2 Hours Execution Plan (Post Deploy)

Date: 2026-03-22
Goal for this session: move from "deployed + tested" to "submission-ready + publish-ready" with complete proof packaging.

## Current State Snapshot
- Status Sepolia deploy: done with 3 gasless proof transactions.
- Arbitrum Sepolia deploy: done with GMX manager deployed and test open/close flow executed.
- Frontend local boot: done and page sections verified.
- Remaining work: documentation completeness, env consistency cleanup, proof quality, and final submission checklist.

## Outcome Target at T+120
- README fully updated with both Status and Arbitrum proof packs.
- Frontend and root env values aligned and validated.
- One command-only replay section added so judges can reproduce quickly.
- Final submission checklist completed and ready for project publish action.

## 0:00-0:20 - Final Proof Pack for Arbitrum

Tasks:
- Extract Arbitrum deployment details from deployment artifact.
- Add GMX manager address, network details, and test tx evidence into README.
- Mark Arbitrum deployment checklist item complete.

Commands:
```bash
cat deployments/arbitrum-deployment.json
```

Success criteria:
- README contains Arbitrum section with:
  - network
  - chainId
  - contract addresses
  - test trade tx hashes (open/close)

---

## 0:20-0:40 - Unified Contract Address Table

Tasks:
- Add one "Deployed Contracts" table in README covering both networks.
- Include Status + Arbitrum explorer links where applicable.

Commands:
```bash
cat deployments/status-sepolia-deployment.json
cat deployments/arbitrum-deployment.json
```

Success criteria:
- README has a single authoritative address table.
- No duplicate or conflicting addresses in other sections.

---

## 0:40-1:00 - Replayable Demo Path (Judge Workflow)

Tasks:
- Add "5-Minute Repro" section in README.
- Provide exact commands to:
  - install
  - compile
  - test
  - verify deployment JSON files
  - run frontend

Commands:
```bash
npm run compile
npm test
cat deployments/status-sepolia-deployment.json
cat deployments/arbitrum-deployment.json
cd frontend && npm run dev
```

Success criteria:
- Any reviewer can execute one linear command flow from README.
- No placeholder values in proof sections.

---

## 1:00-1:20 - Environment Consistency Pass

Tasks:
- Verify env parity between root and frontend env files.
- Ensure NEXT_PUBLIC values exactly match deployed addresses.
- Remove stale or duplicate settings that could confuse runtime behavior.

Commands:
```bash
cat .env.local
cat frontend/.env.local
```

Success criteria:
- Frontend points to latest deployed Status + Arbitrum addresses.
- No empty NEXT_PUBLIC deployment keys remain.

---

## 1:20-1:40 - Frontend UX Smoke Pass

Tasks:
- Launch frontend and verify key UI flows are present:
  - create demand form
  - active demands section
  - network status blocks
- Capture quick proof notes for README (local verification).

Commands:
```bash
cd frontend
npm run dev
```

Success criteria:
- Frontend boots without runtime errors.
- Required sections are visible and responsive.

---

## 1:40-1:55 - Submission Checklist Closure

Tasks:
- Update README checklist status for completed milestones.
- Add a concise "Track Mapping" section:
  - Status track evidence
  - bond.credit evidence
  - Arkhai Applications evidence
  - Arkhai Extensions evidence

Success criteria:
- Checklist reflects actual current project state.
- Each track has at least one concrete proof artifact linked.

---

## 1:55-2:00 - Publish Readiness Gate

Tasks:
- Final pass before publish:
  - contracts compiled
  - tests green
  - proof links valid
  - deployment artifacts present
- Prepare the exact API/update payload notes for final project update/publish step.

Success criteria:
- Project is documentation-complete and publish-ready.
- No unresolved blockers remain for the publish action.

## Commands to Run in This 2-Hour Window

```bash
npm run compile
npm test
cat deployments/status-sepolia-deployment.json
cat deployments/arbitrum-deployment.json
cat .env.local
cat frontend/.env.local
cd frontend && npm run dev
```

## Risks and Mitigations
- Risk: Node version warning (Hardhat on Node 25).
- Mitigation: Continue with current environment for this session; switch to Node 20 LTS before final release branch/tag.

- Risk: Inconsistent env values between root and frontend.
- Mitigation: Keep frontend contract addresses in frontend/.env.local and verify against deployment JSON each update.

- Risk: Missing proof granularity for judges.
- Mitigation: Add explicit tx hashes and explorer links for each claimed completed flow.

## Definition of Done for This Plan
1. README updated with complete Status + Arbitrum proof packs.
2. Env values aligned and validated.
3. Frontend smoke-tested and documented.
4. Submission checklist reflects true completion and is ready for publish.
