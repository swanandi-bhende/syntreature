# bond.credit Track Integration

This document explains how the project integrates with the bond.credit track and how qualification is evaluated.

## Track Focus

bond.credit track requires:

- GMX perpetual trading flow evidence on Arbitrum context
- Credit score linkage using ERC-8004 identity model
- Clear traceability between trade outcome and score update

## Protocols Used

- GMXPositionManager trade wrapper logic
- CreditScoreUpdater for score update linkage
- ERC-8004 identity/credit registry interfaces

## How It Is Implemented

- Position open/close lifecycle is executed through GMXPositionManager.
- Trade result is finalized and emits linkage events.
- Credit score update is requested and applied via score updater path.
- Position key is used as shared linkage ID across trade and score events.

## Qualification Mapping

1. Trade lifecycle evidence
- Evidence: deployments/arbitrum-deployment.testnet.json and deployments/arbitrum-deployment.json (`tradeEvidence`)
- Includes open and close transaction metadata with status and timestamps

2. Credit score linkage
- Evidence: deployment artifacts (`creditScoreEvidence`)
- Includes `scoreUpdateTxHash`, `linkagePositionKey`, and score before/after values

3. Deterministic policy
- Evidence: deployment artifacts (`deterministicCreditPolicy` and `scoreDeltaPolicy`)

## Important Qualification Note

If submitting for strict live-trading interpretation, provide a live-network artifact and explorer links for open/close/score-update transactions for the hackathon window.

## Primary Evidence Files

- deployments/arbitrum-deployment.testnet.json
- deployments/arbitrum-deployment.json
- test/GMXPositionManager.acceptance.test.ts
