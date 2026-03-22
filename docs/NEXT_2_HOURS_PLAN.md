# Syntreature: Next 2 Hours Execution Plan

Date: 2026-03-22
Goal for this session: move from scaffolded repo to proof-producing testnet execution for Status + Arbitrum tracks.

## Outcome Target at T+120
- Status Sepolia deployment completed and recorded.
- 3+ Status gasless transaction hashes captured.
- Arbitrum deployment completed and one open/close GMX flow executed on test setup.
- Frontend wired to deployed addresses and load-tested locally.
- README updated with concrete addresses + tx proofs generated in this session.

## Hour 1 (Build + Deploy + Gasless Proofs)

### 0:00-0:10 - Environment and sanity checks
Tasks:
- Ensure runtime/env are set and consistent.
- Confirm compile + tests are green before live deploy.

Commands:
```bash
cp .env.example .env.local
# fill PRIVATE_KEY, STATUS_SEPOLIA_RPC, ARBITRUM_SEPOLIA_RPC
npm run compile
npm test
```

Success criteria:
- Compile succeeds.
- Test suite passes.
- .env.local has non-placeholder values.

---

### 0:10-0:30 - Status Sepolia deployment
Tasks:
- Deploy contracts to Status Sepolia.
- Verify deployment JSON is created.

Commands:
```bash
npm run deploy:status
cat deployments/status-sepolia-deployment.json
```

Success criteria:
- Deployment script exits successfully.
- JSON contains contract addresses for:
  - NLTradingEscrow
  - AIEvaluatedArbiter
  - MockAlkahest
  - MockERC8004

---

### 0:30-0:50 - Capture gasless proof transactions (Status track)
Tasks:
- Validate at least 3 tx hashes for gasless flow:
  - createDemand
  - lockFunds
  - requestArbitration
- Confirm each hash resolves on Status Sepolia explorer.

Commands:
```bash
jq '.transactions' deployments/status-sepolia-deployment.json
```

Manual verification:
- Open each tx hash in https://sepoliascan.status.network
- Save evidence (hashes + links) in README proof section.

Success criteria:
- 3 valid hashes documented and explorer-visible.

---

### 0:50-1:00 - Quick hardening pass
Tasks:
- Remove warning-level issues that can cause confusion in demos.
- Ensure deploy logs are deterministic.

Focus files:
- contracts/escrow/NLTradingEscrow.sol
- contracts/gmx/GMXPositionManager.sol
- scripts/deploy.ts

Success criteria:
- Clean compile after edits.
- No new test regressions.

## Hour 2 (Arbitrum + Frontend + Submission Readiness)

### 1:00-1:20 - Arbitrum deployment and GMX manager validation
Tasks:
- Deploy GMX position manager on Arbitrum Sepolia.
- Validate deployment metadata file exists.

Commands:
```bash
npm run deploy:arbitrum
cat deployments/arbitrum-deployment.json
```

Success criteria:
- GMXPositionManager address produced.
- Deployment JSON includes network, chainId, and contract addresses.

---

### 1:20-1:40 - Frontend wiring and local end-to-end smoke test
Tasks:
- Fill frontend env values with deployed addresses.
- Start Next.js app and verify core flows render:
  - create demand form
  - active demands list
  - network status blocks

Commands:
```bash
# set NEXT_PUBLIC_* values in .env.local
cd frontend
npm install
npm run dev
```

Success criteria:
- Frontend boots without runtime errors.
- Demand creation interaction works in UI simulation path.

---

### 1:40-1:55 - README proof pack update
Tasks:
- Replace placeholders with actual addresses and tx hashes from this session.
- Add concise section: "How this session satisfies each track".

Required updates:
- Status proof table (3+ tx hashes).
- Arbitrum deploy proof.
- Contract address table.
- Exact commands used.

Success criteria:
- README contains no placeholder proof hashes for completed actions.
- Another builder can replay your steps with listed commands.

---

### 1:55-2:00 - Submission prep checkpoint
Tasks:
- Final checklist pass for publish readiness.
- Prepare next session backlog.

Checklist:
- [ ] Status deploy done
- [ ] 3+ gasless tx proofs recorded
- [ ] Arbitrum deploy done
- [ ] Frontend local smoke test done
- [ ] README proof section updated
- [ ] Commit prepared with clear message

Backlog for next session (after these 2 hours):
- Replace mocks with live Alkahest/NLA contracts where feasible.
- Execute live GMX perp trade proof within hackathon window.
- Add short demo video and attach deployed URL for publish step.

## Risk Notes (for this 2-hour window)
- Node version mismatch with Hardhat can cause intermittent issues; if encountered, switch to Node 20 LTS.
- Keep test size small for GMX until proof txs are confirmed.
- Do not block on deep refactors in this window; prioritize proof-producing execution.

## Definition of Done for This Plan
This 2-hour plan is successful if you finish with:
1. two deployment JSON artifacts populated,
2. at least three Status gasless transaction hashes documented,
3. frontend running locally with deployed addresses, and
4. README updated with real, verifiable evidence from this session.
