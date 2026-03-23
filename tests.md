# Test Guide

This document lists how to run tests and what each suite validates.

## 1. Run All Tests

From the repository root:

```bash
npm run test
```

This runs all Hardhat test suites in the test folder.

## 2. Run Individual Test Suites

### NLTradingEscrow

```bash
npx hardhat test test/NLTradingEscrow.test.ts
```

Validates:

- Natural language demand creation
- Input validation and invalid-demand rejection
- Collateral locking flow
- Trade execution recording
- Settlement and lifecycle progression
- End-to-end protocol lifecycle assertions

### AIEvaluatedArbiter

```bash
npx hardhat test test/AIEvaluatedArbiter.test.ts
```

Validates:

- Arbitration request lifecycle
- Agent identity and qualification checks
- Signed proof verification
- Condition evaluation behavior
- Reputation updates on pass/fail outcomes
- Trusted escrow execution paths

### GMXPositionManager Acceptance

```bash
npx hardhat test test/GMXPositionManager.acceptance.test.ts
```

Validates:

- Position open and close lifecycle events
- Trade-result finalization linkage
- Credit update request emissions
- Traceability from close transaction to credit score update

## 3. Fork-Based Test Modes

Status fork test mode:

```bash
npm run test:fork:status
```

Arbitrum fork test mode:

```bash
npm run test:fork:arbitrum
```

Use these when validating behavior against forked chain state.

## 4. Common Troubleshooting

If tests fail due to environment issues, verify:

- .env.local exists in repository root
- RPC endpoints are reachable
- PRIVATE_KEY is configured (for scripts requiring signing)
- Contracts compile successfully before tests

Re-run compile if needed:

```bash
npm run compile
```
