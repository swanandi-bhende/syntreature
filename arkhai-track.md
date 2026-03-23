# Arkhai Track Integration

This document explains how the project integrates with Arkhai tracks (Applications and Escrow Extensions) and how qualification is demonstrated.

## Track Focus

Arkhai Applications expects load-bearing use of Alkahest and/or natural-language-agreements.
Arkhai Escrow Extensions expects a meaningful new primitive beyond a thin wrapper.

## Protocols Used

- Alkahest-style escrow and obligation lifecycle integration
- natural-language-agreements integration pathway for NL demand semantics
- Custom AIEvaluatedArbiter extension contract

## How It Is Implemented

- NLTradingEscrow captures natural-language demand intent and maps it into escrow lifecycle operations.
- AIEvaluatedArbiter adds AI-evaluation, confidence scoring, and reputation-aware arbitration behavior.
- Trusted escrow execution paths support release/clawback lifecycle outcomes.

## Qualification Mapping

1. Applications track (load-bearing integration)
- Evidence:
  - contracts/escrow/NLTradingEscrow.sol
  - contracts/interfaces/IAlkahest.sol
  - integration references in deployment and test flows

2. Escrow Extensions track (new primitive)
- Evidence:
  - contracts/arbiters/AIEvaluatedArbiter.sol
  - test/AIEvaluatedArbiter.test.ts
- Extension behaviors include signed evaluation proofs, reputation updates, and arbitration execution lifecycle.

## Primary Evidence Files

- contracts/escrow/NLTradingEscrow.sol
- contracts/arbiters/AIEvaluatedArbiter.sol
- test/NLTradingEscrow.test.ts
- test/AIEvaluatedArbiter.test.ts
