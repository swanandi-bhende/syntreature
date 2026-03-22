# 🔗 Integration Guide

This guide explains how to integrate Syntreature with external protocols: Alkahest, GMX, ERC-8004, and more.

## 1. Alkahest Integration

### What is Alkahest?
Alkahest is a modular escrow protocol for conditional property transfers. It provides:
- BaseEscrowObligation – Core escrow contract
- Arbiter interface – Custom arbitration logic
- Natural-language-agreements – NL-to-onchain parsing

### Repository
https://github.com/arkhai-io/alkahest

### Integration Steps

#### Step 1: Import Alkahest Contracts
```solidity
// In your repository:
import "@arkhai-io/alkahest/contracts/BaseEscrowObligation.sol";
import "@arkhai-io/alkahest/contracts/interfaces/IArbitrable.sol";
```

#### Step 2: Extend BaseEscrowObligation
```solidity
contract NLTradingEscrow is BaseEscrowObligation {
  // Your custom escrow logic
}
```

#### Step 3: Use Alkahest SDK (TypeScript)
```typescript
import { AlkahestSDK } from "@alkahest/sdk";

const sdk = new AlkahestSDK(provider);
const obligation = await sdk.createObligation({
  beneficiary: agentAddress,
  amount: ethers.parseEther("0.01"),
  token: collateralToken,
  arbiter: arbiterAddress
});
```

### Your Implementation
- Contract: `contracts/escrow/NLTradingEscrow.sol` (lines 45-100)
- Key functions: `lockFunds()`, `releaseFunds()`, `clawback()`
- Integration: Calling `IAlkahest` interface (mocked in tests)

### Next: Replace Mocks with Real Contracts
```typescript
// In deployments, instead of:
const alkahest = await MockAlkahest.deploy();

// Use:
const AlkahestFactory = await ethers.getContractFactory("BaseEscrowObligation");
// Or import from @arkhai-io/alkahest npm package
```

---

## 2. Natural Language Agreements

### What is NLA?
Natural Language Agreements converts plain English into onchain-executable conditions.

### Repository
https://github.com/arkhai-io/natural-language-agreements

### Integration Steps

#### Step 1: Install SDK
```bash
npm install @arkhai-io/natural-language-agreements
```

#### Step 2: Parse NL Demands
```typescript
import { parseAgreement, hashCondition } from "@arkhai-io/natural-language-agreements";

const nlDemand = "Lock 0.01 ETH and open long if price > 3200 within 24h";
const agreement = parseAgreement(nlDemand);

// Returns:
// {
//   requester: "0x...",
//   collateral: { amount: "0.01", token: "ETH" },
//   condition: { type: "price", threshold: 3200, asset: "ETH" },
//   timeout: 86400,
//   action: { type: "long", size: "50 USD" }
// }

const conditionHash = hashCondition(agreement.condition);
```

#### Step 3: Store Parsed Condition Onchain
```solidity
// In NLTradingEscrow.sol:
function createDemand(string memory nlDescription, ...) {
  bytes32 conditionHash = nlAgreements.hashCondition(nlDescription);
  // Store for arbiter evaluation
}
```

### Your Implementation
- Contract: `contracts/escrow/NLTradingEscrow.sol` (lines 120-150)
- Mock: `contracts/mocks/Mocks.sol` (MockNaturalLanguageAgreements)
- Integration: Off-chain parsing in deployment script

### Next: Use Real NLA Contract
```solidity
// Current (mock):
INaturalLanguageAgreements nlAgreements = INaturalLanguageAgreements(nlAgreementsAddress);

// Production: import real contract
import "@arkhai-io/nlags/contracts/NaturalLanguageAgreements.sol";
```

---

## 3. ERC-8004 Agent Identity

### What is ERC-8004?
Standard for onchain agent identity with credit scoring.

### Standard
https://github.com/ethereum/EIPs/pull/8004

### Integration Steps

#### Step 1: Register Your Agent
Already done in Synthesis registration:
```
Agent ID: c07fc85a26144aec97a99dc9247b5a0d
Wallet: 0xd182af8155f1D4E2A05A4aA811A2056d1b961960
```

#### Step 2: Update Credit Score
```solidity
// In AIEvaluatedArbiter.sol:
function _syncToERC8004(uint256 agentId, uint256 creditScore) {
  IERC8004 erc8004 = IERC8004(erc8004Address);
  erc8004.updateCreditScore(agentId, creditScore);
}
```

#### Step 3: Query Agent Metadata
```typescript
const erc8004Address = "0x..."; // Mainnet: deployed address
const agentId = 1;

const owner = await erc8004.ownerOf(agentId);
const metadata = await erc8004.getAgentMetadata(agentId);
const creditScore = await erc8004.balanceOf(owner); // or custom getter
```

### Your Implementation
- Contracts: `contracts/arbiters/AIEvaluatedArbiter.sol` (lines 150-160)
- Mock: `contracts/mocks/Mocks.sol` (MockERC8004)
- Integration: Credit score sync on arbitration

### Next: Use Real ERC-8004 Registry
```solidity
// Find deployed ERC-8004 registry:
// Mainnet: 0x... (check etherscan)
// Status: 0x... (check statuscan)
// Arbitrum: 0x...

import "@erc8004/contracts/ERC8004Registry.sol";
```

---

## 4. GMX v2 Integration

### What is GMX?
Decentralized perpetual futures protocol on Arbitrum with deep liquidity.

### Documentation
https://docs.gmx.io/  
https://github.com/gmx-io/gmx-contracts

### Integration Steps

#### Step 1: Install GMX SDK
```bash
npm install @gmx-io/gmx-interface ethers@6
```

#### Step 2: Create Position
```typescript
import { GMXClient } from "@gmx-io/gmx-sdk";

const gmx = new GMXClient(arbitrumProvider);

const order = await gmx.createOrder({
  market: ETH_USD_MARKET,
  initialCollateralToken: USDC,
  initialCollateralDeltaAmount: ethers.parseUnits("50", 6), // 50 USDC
  sizeDeltaUsd: ethers.parseUnits("250", 30), // 250 USD (5x leverage)
  isLong: true
});

await order.wait();
```

#### Step 3: Monitor Position
```typescript
const position = await gmx.getPosition(ETH_USD_MARKET, userAddress, true);
console.log("Position PnL:", position.pnl);
console.log("Leverage:", position.leverage);
```

#### Step 4: Close Position
```typescript
const closeOrder = await gmx.closePosition({
  market: ETH_USD_MARKET,
  isLong: true
});

await closeOrder.wait();
```

### Your Implementation
- Contract: `contracts/gmx/GMXPositionManager.sol`
- Current: Wrapper with mock Chainlink prices
- Integration: Located in deployment script for Arbitrum

### Next: Connect to Real GMX Contracts
```typescript
// In scripts/deployArbitrum.ts:
// Replace ethers.ZeroAddress with real GMX router:

const GMX_POSITION_ROUTER = "0x7452c558d45f8afb8b924c8c5da1642566efc624"; // Arbitrum
const GMX_EXCHANGE_ROUTER = "0x7C68C7266A29ff1d9..."; // verify address

const gmxManager = await GMXPositionManager.deploy(
  GMX_POSITION_ROUTER,
  GMX_EXCHANGE_ROUTER,
  CHAINLINK_ETH_PRICE_FEED
);
```

---

## 5. Alkahest TypeScript SDK

### What is alkahest-ts?
TypeScript SDK for interacting with Alkahest contracts.

### Repository
https://github.com/arkhai-io/alkahest-ts

### Integration Steps

#### Step 1: Install
```bash
npm install @alkahest/ts
```

#### Step 2: Use SDK in Production
```typescript
import {
  AlkahestClient,
  createObligation,
  releaseObligation
} from "@alkahest/ts";

const alkahestClient = new AlkahestClient(provider, alkahestAddress);

// Create obligation
const obligation = await alkahestClient.createObligation({
  beneficiary: agentAddress,
  amount: ethers.parseEther("0.01"),
  token: collateralTokenAddress,
  arbiter: arbiterAddress,
  deadline: Math.floor(Date.now() / 1000) + 86400
});

// Release funds
await alkahestClient.releaseObligation(obligation.id);
```

### Your Implementation
- Current: Using `IAlkahest` interface calls directly
- Next: Replace with `@alkahest/ts` SDK

---

## 6. Chainlink Price Feeds

### What is Chainlink?
Decentralized oracle network for on-chain price data.

### Mainnet Feeds
```
ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
```

### Arbitrum Feeds
```
ETH/USD: 0x639Fe6ab55C921f74e7fac19EEcf3a7beDD4AE27
```

### Integration
```solidity
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

function _getETHPrice() internal view returns (uint256) {
  AggregatorV3Interface priceFeed = AggregatorV3Interface(0x639Fe6...);
  (, int256 price,,,) = priceFeed.latestRoundData();
  return uint256(price) * 10 ** (18 - 8); // Normalize to 18 decimals
}
```

### Your Implementation
- Mock: `contracts/mocks/Mocks.sol` (MockPriceFeed)
- Production: Replace with real Chainlink address

---

## 7. Hardhat Forking

### Fork Status Sepolia
```bash
NODE_URL=https://public.sepolia.rpc.status.network npm run test:fork:status
```

### Fork Arbitrum
```bash
NODE_URL=https://arb-sepolia.g.alchemy.com/v2/$ALCHEMY_API_KEY npm run test:fork:arbitrum
```

### Benefits
- Test against real network state
- Use real protocol contracts
- No testnet faucet dependency
- Realistic gas estimation

### Example Fork Test
```typescript
import { hardhat } from "hardhat";

describe("GMX Integration (Fork)", function () {
  before(async function () {
    // Fork Arbitrum
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: process.env.ARBITRUM_RPC,
          blockNumber: 123456789
        }
      }]
    });
  });

  it("should execute real GMX trade", async () => {
    // Use real GMX contracts from fork
  });
});
```

---

## 8. Off-Chain Oracle Implementation

### AI Evaluation Flow
```
NL Demand Created
    ↓
Agent reads: nlDescription, onchain state
    ↓
Copilot AI evaluates condition
    ↓
Oracle submits evaluation to AIEvaluatedArbiter.evaluateCondition()
    ↓
Arbiter releases/claws back funds
    ↓
Credit score updated on ERC-8004
```

### Implementation
```typescript
// Off-chain oracle (Node.js service)
import { AIEvaluatedArbiter } from "./abis";

async function evaluateArbitration(caseId: number) {
  // 1. Fetch case details
  const arbitrationCase = await arbiterContract.getCase(caseId);
  
  // 2. Fetch on-chain data (prices, trades)
  const ethPrice = await getPriceFromChainlink();
  const tradeState = await getTradeState();
  
  // 3. Evaluate NL condition with AI
  const shouldRelease = await copilotAI.evaluateCondition(
    arbitrationCase.nlCondition,
    { ethPrice, tradeState }
  );
  
  // 4. Submit evaluation onchain
  const proof = ethers.id(JSON.stringify({ shouldRelease, timestamp: Date.now() }));
  await arbiterContract.evaluateCondition(caseId, shouldRelease, proof);
}

// Poll for new cases every 10 seconds
setInterval(async () => {
  const caseId = await arbiterContract.caseCounter();
  for (let i = 0; i < caseId; i++) {
    const arbitrationCase = await arbiterContract.getCase(i);
    if (!arbitrationCase.resolved) {
      await evaluateArbitration(i);
    }
  }
}, 10000);
```

---

## Deployment Checklist

- [ ] Replace all Mock contracts with real protocol contracts
- [ ] Set real Alkahest contract address
- [ ] Set real ERC-8004 registry address
- [ ] Set real GMX router addresses (Arbitrum)
- [ ] Set real Chainlink price feed address
- [ ] Deploy off-chain oracle service
- [ ] Update hardhat.config with production RPC endpoints
- [ ] Run fork tests against real protocols
- [ ] Deploy to Status Sepolia testnet
- [ ] Deploy to Arbitrum testnet
- [ ] Deploy to Arbitrum mainnet (when ready)
- [ ] Update README with deployed addresses
- [ ] Submit to Synthesis dashboard

---

## Helpful Resources

| Component | Docs | Github |
|-----------|------|--------|
| Alkahest | [Docs](https://alkahest.io) | [arkhai-io/alkahest](https://github.com/arkhai-io/alkahest) |
| NL Agreements | [Docs](https://nlags.arkhai.io) | [arkhai-io/natural-language-agreements](https://github.com/arkhai-io/natural-language-agreements) |
| ERC-8004 | [EIP](https://github.com/ethereum/EIPs/pull/8004) | [ethereum/EIPs](https://github.com/ethereum/EIPs) |
| GMX v2 | [Docs](https://docs.gmx.io) | [gmx-io/gmx-contracts](https://github.com/gmx-io/gmx-contracts) |
| Chainlink | [Docs](https://docs.chain.link) | [smartcontractkit/contracts](https://github.com/smartcontractkit/contracts) |
| ethskills | [Site](https://ethskills.com) | Reference materials |

---

**Last Updated:** 2026-03-22  
**Status:** Ready for integration with real protocols
