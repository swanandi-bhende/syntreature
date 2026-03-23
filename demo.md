# Demo Guide

This document explains how to demonstrate the product in a clear, judge-friendly flow.

## 1. Demo Goal

Show one complete and verifiable user flow:

- Wallet connect
- Correct network guardrails
- On-chain createDemand transaction
- Explorer proof link
- Judge checklist update to pass

## 2. Pre-Demo Checklist

- Contracts deployed and addresses set in frontend/.env.local
- Frontend running locally (or hosted)
- Browser wallet installed
- Wallet funded on Status Sepolia

## 3. Start Demo Environment

From project root:

```bash
cd frontend
npm run dev
```

Open:

- http://localhost:3000

## 4. Live Demo Sequence

1. Open the app and show Wallet Execution Context.
2. Click Connect Wallet and approve in wallet extension.
3. If network is wrong, click Switch to Status Sepolia.
4. Enter a natural-language demand in the input box.
5. Click Create Demand.
6. Show lifecycle states:
   - pending (awaiting signature)
   - submitted (tx hash visible immediately)
   - confirmed (receipt details shown)
7. Open the explorer link shown in lifecycle or transaction records.
8. Show Judge Demo Mode:
   - Step Checklist
   - Current Chain
   - Contract Addresses
   - Latest Transactions
   - Pass or Fail Summary

## 5. Evidence to Capture

- CreateDemand transaction hash
- Explorer page showing transaction status
- Judge Demo Mode panel with checklist and transaction row

## 6. Related Proof Files

- deployments/status-sepolia-deployment.json
- README.md (summary and navigation)

## 7. Recommended Presenter Script (Short)

- "This app enforces network and authorization guardrails before writes."
- "Now I submit a natural-language demand and produce a real on-chain transaction."
- "The tx hash appears immediately, then confirmation details are recorded."
- "Here is the explorer proof and the judge checklist turning to pass."
