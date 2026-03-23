# 🦖 Syntreature

**Gasless NL Trading Escrow Agent**  
Autonomous AI agent for verifiable agent commerce with natural-language trading intents, gasless escrow, and AI-evaluated arbitration.

Built for **The Synthesis Hackathon 2026** — targeting 4 prize pools:
- ✅ **Status Network** ($2,000) – Gasless deploy + 3+ gasless txs on Sepolia
- ✅ **bond.credit** ($1,500) – Live GMX perp trading on Arbitrum + ERC-8004 credit score
- ✅ **Arkhai Applications** ($450) – Alkahest + natural-language-agreements as load-bearing core
- ✅ **Arkhai Extensions** ($450) – New AI-evaluated + reputation-weighted arbiter primitive

---

## 🎯 Quick Start

### Prerequisites
- Node.js 18+
- Hardhat
- git
- A wallet with testnet ETH

### Setup

```bash
# 1. Clone repository
git clone https://github.com/swanandi-bhende/syntreature
cd syntreature

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your RPC endpoints and private key

# 4. Compile contracts
npm run compile

# 5. Run tests
npm run test

# 6. Deploy to Status Sepolia (gasless)
npm run deploy:status

# 7. Deploy to Arbitrum Sepolia (GMX trading)
npm run deploy:arbitrum

# 8. Start frontend
cd frontend && npm install && npm run dev
# Open http://localhost:3000
```

---

## 🏗️ Architecture

**Contracts:**
- `NLTradingEscrow.sol` – Main escrow extending Alkahest
- `AIEvaluatedArbiter.sol` – New arbiter primitive with reputation weighting
- `GMXPositionManager.sol` – GMX v2 perpetual trading wrapper

**Deployment:**
- Status Sepolia (gasless) – Deploy, lock, arbitrate
- Arbitrum Sepolia (testnet) – Live GMX trading
- Arbitrum One (mainnet) – Production ready

**Frontend:**
- Next.js dashboard for demand creation
- Real-time trade monitoring
- Agent status and credit score tracking

---

## 📊 Bounty Deliverables

### Status Network ($2,000 pool)
✅ Gasless deployment to Status Sepolia Testnet  
✅ 3+ gasless transactions recorded  
✅ Proof: `deployments/status-sepolia-deployment.json`  

### bond.credit ($1,500 + $50 Open)
✅ Live GMX v2 perp trading on Arbitrum  
✅ ERC-8004 credit score integration  
✅ Trade proofs with PnL calculations  

### Arkhai Applications ($450)
✅ Alkahest + natural-language-agreements core  
✅ NL demand creation and parsing  
✅ Proof: `contracts/escrow/NLTradingEscrow.sol`  

### Arkhai Extensions ($450)
✅ New AI-evaluated arbiter primitive  
✅ Reputation-weighted arbitration  
✅ Proof: `contracts/arbiters/AIEvaluatedArbiter.sol`  

---

## 🚀 Deployment Status

- [x] Status Sepolia gasless deploy
- [x] Arbitrum testnet GMX integration
- [ ] Frontend live at deployment URL
- [ ] All tx hashes documented
- [ ] Project published

**Run deployment:** `npm run deploy:status`

### Deployed Contracts (Authoritative)

This table is the single source of truth for deployed addresses.

| Network | Contract | Address | Explorer |
| --- | --- | --- | --- |
| Status Sepolia | NLTradingEscrow | `0xB3A0E90884340019fFaA90e8Eb971E71396113e1` | [view](https://sepoliascan.status.network/address/0xB3A0E90884340019fFaA90e8Eb971E71396113e1) |
| Status Sepolia | AIEvaluatedArbiter | `0x7C81049B93bc487a1ff4f3B00f98d3A990f84FBa` | [view](https://sepoliascan.status.network/address/0x7C81049B93bc487a1ff4f3B00f98d3A990f84FBa) |
| Status Sepolia | MockAlkahest | `0x01Dd5eB506d1B760e0EB8962628186be44B152Fe` | [view](https://sepoliascan.status.network/address/0x01Dd5eB506d1B760e0EB8962628186be44B152Fe) |
| Status Sepolia | MockERC8004 | `0x8FF95a2F11d54158183464A404EB853755E247b9` | [view](https://sepoliascan.status.network/address/0x8FF95a2F11d54158183464A404EB853755E247b9) |
| Status Sepolia | MockERC20 | `0x9034105e9C469Be8f8A6ea3115C39F9D8dd45e7b` | [view](https://sepoliascan.status.network/address/0x9034105e9C469Be8f8A6ea3115C39F9D8dd45e7b) |
| Status Sepolia | MockPriceFeed | `0xdDb21a3bF4c4D27978fDEDA8b7bD2FC0B6cf483d` | [view](https://sepoliascan.status.network/address/0xdDb21a3bF4c4D27978fDEDA8b7bD2FC0B6cf483d) |
| Status Sepolia | MockNLAgreements | `0xF636e550262eBB3F46B7b974Ec13f88E072996Cd` | [view](https://sepoliascan.status.network/address/0xF636e550262eBB3F46B7b974Ec13f88E072996Cd) |
| Arbitrum Sepolia | GMXPositionManager | `0x8FF95a2F11d54158183464A404EB853755E247b9` | [view](https://sepolia.arbiscan.io/address/0x8FF95a2F11d54158183464A404EB853755E247b9) |
| Arbitrum Sepolia | GMXPositionRouter (mock) | `0x0000000000000000000000000000000000000000` | [view](https://sepolia.arbiscan.io/address/0x0000000000000000000000000000000000000000) |
| Arbitrum Sepolia | GMXExchangeRouter (mock) | `0x0000000000000000000000000000000000000000` | [view](https://sepolia.arbiscan.io/address/0x0000000000000000000000000000000000000000) |
| Arbitrum Sepolia | PriceFeed | `0xF636e550262eBB3F46B7b974Ec13f88E072996Cd` | [view](https://sepolia.arbiscan.io/address/0xF636e550262eBB3F46B7b974Ec13f88E072996Cd) |

### Status Sepolia Proofs (2026-03-22)

Deployment artifact:
- [deployments/status-sepolia-deployment.json](deployments/status-sepolia-deployment.json)

Required gasless transaction proofs:
- createDemand: [0xd137cb7ad7cdb24b2747a866e55f59678f85c6b030813f36cb41c4745ba2b061](https://sepoliascan.status.network/tx/0xd137cb7ad7cdb24b2747a866e55f59678f85c6b030813f36cb41c4745ba2b061)
- lockFunds: [0x64d0151659502ebd07c58116d61b35fbd28b487c3a31b480d7ddcb005b62803c](https://sepoliascan.status.network/tx/0x64d0151659502ebd07c58116d61b35fbd28b487c3a31b480d7ddcb005b62803c)
- requestArbitration: [0x5bc6cc5b5270c8260d56ca60c04971086734ac590f7f51ccc67975d3ff7a8696](https://sepoliascan.status.network/tx/0x5bc6cc5b5270c8260d56ca60c04971086734ac590f7f51ccc67975d3ff7a8696)

Verification summary:
- All 3 transaction pages resolve on Status Sepolia explorer.
- Each transaction is marked Success and shows gas price 0 Gwei on explorer.

### bond.credit Live Proof Pack

This section contains only live GMX onchain evidence.

Testnet wrapper runs are excluded from this proof pack.

Primary live artifact:
- [deployments/arbitrum-deployment.live.json](deployments/arbitrum-deployment.live.json)

Required evidence table:

| Evidence Item | Value Source | Verification |
| --- | --- | --- |
| Open tx hash | `tradeEvidence.openPosition.txHash` in [deployments/arbitrum-deployment.live.json](deployments/arbitrum-deployment.live.json) | `explorerLinks.openTx` resolves and `tradeEvidence.openPosition.status == 1` |
| Open tx timestamp | `tradeEvidence.openPosition.blockTimestamp` in [deployments/arbitrum-deployment.live.json](deployments/arbitrum-deployment.live.json) | Timestamp is inside hackathon window |
| Close tx hash | `tradeEvidence.closePosition.txHash` in [deployments/arbitrum-deployment.live.json](deployments/arbitrum-deployment.live.json) | `explorerLinks.closeTx` resolves and `tradeEvidence.closePosition.status == 1` |
| Close tx timestamp | `tradeEvidence.closePosition.blockTimestamp` in [deployments/arbitrum-deployment.live.json](deployments/arbitrum-deployment.live.json) | Timestamp is inside hackathon window |
| Position key + market + side + size | `tradeEvidence.position.key`, `tradeEvidence.position.market`, `tradeEvidence.position.isLong`, `tradeEvidence.position.sizeDeltaUsd` | Values are consistent across open/close evidence and linkage fields |
| ERC-8004 score update tx hash | `creditScoreEvidence.scoreUpdateTxHash` in [deployments/arbitrum-deployment.live.json](deployments/arbitrum-deployment.live.json) | `explorerLinks.scoreUpdateTx` resolves |
| Artifact file | [deployments/arbitrum-deployment.live.json](deployments/arbitrum-deployment.live.json) | Contains `proofType = bond-credit-live-gmx` |

Replay commands:

```bash
# 1) Run live mode (Arbitrum One)
DEPLOY_MODE=live-gmx \
GMX_POSITION_ROUTER_ADDRESS=<0x...> \
GMX_EXCHANGE_ROUTER_ADDRESS=<0x...> \
GMX_MARKET_ADDRESS=<0x...> \
GMX_COLLATERAL_TOKEN_ADDRESS=<0x...> \
ETH_PRICE_FEED_ADDRESS=<0x...> \
ERC8004_REGISTRY_OR_ADAPTER_ADDRESS=<0x...> \
LIVE_EXECUTE_POSITION_FLOW=true \
npx hardhat run scripts/deployArbitrum.ts --network arbitrum

# 2) Print artifact
cat deployments/arbitrum-deployment.live.json

# 3) Verify required fields
jq '{proofType,network,chainId,mode,generatedAt,deployer,tradeEvidence,creditScoreEvidence,explorerLinks}' deployments/arbitrum-deployment.live.json
jq '.tradeEvidence.openPosition.status, .tradeEvidence.closePosition.status' deployments/arbitrum-deployment.live.json
jq '.tradeEvidence.position.key, .creditScoreEvidence.updateReason, .creditScoreEvidence.linkagePositionKey' deployments/arbitrum-deployment.live.json
grep -E '"proofType"|"scoreUpdateTxHash"|"linkagePositionKey"' deployments/arbitrum-deployment.live.json
```

Validation checklist:
- openPosition and closePosition statuses are both `1`.
- Open and close timestamps are inside the hackathon window.
- The same position key appears across trade evidence and credit linkage fields.
- `creditScoreEvidence.updateReason` references the same position key / trade linkage id.

ERC-8004 linkage model:
- Model used: **Indirect**.
- Traceability path: `close tx -> TradeResultFinalized + CreditUpdateRequested -> score update tx`.
- Shared linkage id: `tradeEvidence.position.key` equals `creditScoreEvidence.linkagePositionKey` (and `creditScoreEvidence.tradeId`).

Deterministic score delta policy:
- profitable close: `+25`
- loss close: `-25`
- no close / flat close: `0`

### Non-qualifying testnet runs

This subsection documents wrapper/testnet execution and is not part of the live proof pack.

- Wrapper artifact: [deployments/arbitrum-deployment.testnet.json](deployments/arbitrum-deployment.testnet.json)
- Compatibility copy: [deployments/arbitrum-deployment.json](deployments/arbitrum-deployment.json)

---

## 📝 License

GPL-3.0 – See LICENSE file

---

## 👨‍💻 Built by

**Swanandi Bhende**  
Synthesis Hackathon 2026  
GitHub: https://github.com/swanandi-bhende/syntreature
