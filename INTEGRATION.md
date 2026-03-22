# Integration Evidence Guide

This document is written for judges. It shows executed integration paths and where to verify each proof in code and artifacts.

## Load-bearing proof

### Exact interfaces used

The escrow path uses protocol-oriented interfaces from `contracts/interfaces/IAlkahest.sol`:

- `IAlkahest.createObligation(...)`
- `IAlkahest.lockCollateral(...)`
- `IAlkahest.resolveObligation(...)`
- `IAlkahest.releaseObligation(...)`
- `IAlkahest.clawbackObligation(...)`
- `IAlkahest.getObligation(...)`
- `INaturalLanguageAgreements.hashCondition(...)`
- `IERC8004.updateCreditScore(...)`

The escrow implementation using these calls is in `contracts/escrow/NLTradingEscrow.sol`.

### Exact lifecycle path

Executed lifecycle (contract-enforced):

1. Agent calls `createDemand(...)`.
2. Contract hashes NL condition with `INaturalLanguageAgreements.hashCondition`.
3. Contract creates protocol obligation with `IAlkahest.createObligation`.
4. Agent locks collateral with `lockFunds(...)` -> `IAlkahest.lockCollateral`.
5. Agent records execution with `recordTradeExecution(...)` (arbitration gate).
6. Settlement path:
   - Release: `resolveObligation(..., true, ...)` then `releaseObligation(...)`
   - Clawback: `resolveObligation(..., false, ...)` then `clawbackObligation(...)`
7. Contract verifies protocol status transitions after each lifecycle call via `getObligation(...).status`.

Local state is mirrored only after protocol state confirms transition.

### Real mode deployment prerequisites

Run `scripts/deploy.ts` in `real` integration mode only when all protocol addresses are configured:

- `ALKAHEST_CORE_ADDRESS`
- `NL_AGREEMENTS_ADDRESS`
- `ERC8004_REGISTRY_ADDRESS`

Script behavior:

- Fails fast if real mode is selected and any required address is missing/invalid.
- Defaults to `real` if all required addresses are present.
- Falls back to `mock` only when real prerequisites are not satisfied.

## Non-qualifying modes

`mock` mode is a local development and test mode only.

- It deploys mock protocol contracts.
- It is explicitly marked as non-qualifying in deployment artifacts.
- It must not be used as partner-track proof for live protocol deployment claims.

`real` mode is the qualifying path for protocol deployment claims.

## Evidence checklist

Use the deployment artifact at `deployments/status-sepolia-deployment.json`.

Required evidence and where to find it:

1. Integration mode
   - Field: `integrationMode`
2. Protocol addresses used
   - Field: `protocolAddressesUsed`
3. Condition hash
   - Field: `protocolDemandEvidence.conditionHash`
4. Obligation id
   - Field: `protocolDemandEvidence.createdObligationId`
5. Lifecycle tx hashes
   - Field: `transactions.createDemand`
   - Field: `transactions.lockFunds`
   - Field: `transactions.recordTradeExecution`
   - Field: `transactions.requestArbitration`
   - Field: `transactions.settlement.hash`
6. Final mirrored protocol proof
   - Field: `protocolDemandEvidence.finalExecutionProof`

Judge verification flow:

1. Confirm `integrationMode`.
2. Confirm protocol addresses are non-zero and valid.
3. Confirm condition hash and obligation id are present.
4. Confirm lifecycle tx hashes exist for each step.
5. Confirm final execution proof contains obligation id, lifecycle status, and last protocol action timestamp.

## Package/import proof

### Current production-path contract boundary

Current executed contract path uses local adapter interfaces in `contracts/interfaces/IAlkahest.sol` and not direct external package imports inside `NLTradingEscrow.sol`.

Why this is intentional:

- Public, canonical Status Sepolia deployments for Alkahest and NLA are not currently published.
- A stable adapter interface is used so escrow logic remains unchanged across network-specific ABI differences.
- Only adapter/deployment wiring changes per network.

### Adapter pattern and rationale

Adapter layer used:

- `IAlkahest` includes both richer lifecycle methods and compatibility hooks.
- `NLTradingEscrow` depends on lifecycle methods only for settlement-critical transitions.
- Mock contracts implement the same interface for deterministic testnet-only validation.

This keeps application logic stable while enabling migration to direct upstream contracts when canonical network deployments or finalized ABIs are available.

## Linked proof files

- Escrow integration logic: `contracts/escrow/NLTradingEscrow.sol`
- Interface boundary: `contracts/interfaces/IAlkahest.sol`
- Mock protocol adapter: `contracts/mocks/MockAlkahest.sol`
- Deployment mode + artifact logic: `scripts/deploy.ts`
- End-to-end lifecycle test: `test/NLTradingEscrow.test.ts`

## Judge quick summary

This repo demonstrates load-bearing integration by requiring:

1. NL condition hash generation before demand acceptance.
2. Protocol obligation creation before lock eligibility.
3. Protocol status confirmations before local lifecycle transitions.
4. Artifact-level proof fields for condition hash, obligation id, lifecycle txs, and final execution snapshot.

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
