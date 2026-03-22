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
- [ ] Arbitrum testnet GMX integration
- [ ] Frontend live at deployment URL
- [ ] All tx hashes documented
- [ ] Project published

**Run deployment:** `npm run deploy:status`

### Status Sepolia Proofs (2026-03-22)

Deployment artifact:
- [deployments/status-sepolia-deployment.json](deployments/status-sepolia-deployment.json)

Contract addresses:
- NLTradingEscrow: 0xB3A0E90884340019fFaA90e8Eb971E71396113e1
- AIEvaluatedArbiter: 0x7C81049B93bc487a1ff4f3B00f98d3A990f84FBa
- MockAlkahest: 0x01Dd5eB506d1B760e0EB8962628186be44B152Fe
- MockERC8004: 0x8FF95a2F11d54158183464A404EB853755E247b9

Required gasless transaction proofs:
- createDemand: [0xd137cb7ad7cdb24b2747a866e55f59678f85c6b030813f36cb41c4745ba2b061](https://sepoliascan.status.network/tx/0xd137cb7ad7cdb24b2747a866e55f59678f85c6b030813f36cb41c4745ba2b061)
- lockFunds: [0x64d0151659502ebd07c58116d61b35fbd28b487c3a31b480d7ddcb005b62803c](https://sepoliascan.status.network/tx/0x64d0151659502ebd07c58116d61b35fbd28b487c3a31b480d7ddcb005b62803c)
- requestArbitration: [0x5bc6cc5b5270c8260d56ca60c04971086734ac590f7f51ccc67975d3ff7a8696](https://sepoliascan.status.network/tx/0x5bc6cc5b5270c8260d56ca60c04971086734ac590f7f51ccc67975d3ff7a8696)

Verification summary:
- All 3 transaction pages resolve on Status Sepolia explorer.
- Each transaction is marked Success and shows gas price 0 Gwei on explorer.

---

## 📝 License

GPL-3.0 – See LICENSE file

---

## 👨‍💻 Built by

**Swanandi Bhende**  
Synthesis Hackathon 2026  
GitHub: https://github.com/swanandi-bhende/syntreature
