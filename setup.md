# Setup Guide

This document explains how to set up the project for local development, testing, deployment, and frontend demo use.

## 1. Prerequisites

- Node.js 18 or newer
- npm
- Git
- A wallet private key with testnet funds (Status Sepolia and optionally Arbitrum Sepolia)

## 2. Clone and Install

```bash
git clone https://github.com/swanandi-bhende/syntreature
cd syntreature
npm install
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

## 3. Environment Configuration (Root)

Create root environment file:

```bash
cp .env.example .env.local
```

Required root keys:

- STATUS_SEPOLIA_RPC
- ARBITRUM_SEPOLIA_RPC
- PRIVATE_KEY

Optional root keys:

- ETHERSCAN_API_KEY
- ARBISCAN_API_KEY
- REPORT_GAS
- COINMARKETCAP_API_KEY

The root file is used by Hardhat scripts (compile, test, deploy).

## 4. Environment Configuration (Frontend)

Create or update frontend environment file:

```bash
cd frontend
touch .env.local
```

Required frontend keys:

- NEXT_PUBLIC_STATUS_CHAIN_ID
- NEXT_PUBLIC_ARBITRUM_CHAIN_ID
- NEXT_PUBLIC_STATUS_EXPLORER
- NEXT_PUBLIC_ARBITRUM_EXPLORER
- NEXT_PUBLIC_ESCROW_ADDRESS_STATUS
- NEXT_PUBLIC_ARBITER_ADDRESS_STATUS
- NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM
- NEXT_PUBLIC_AGENT_ADDRESS
- NEXT_PUBLIC_STATUS_RPC
- NEXT_PUBLIC_COLLATERAL_TOKEN_STATUS

## 5. Compile Contracts

```bash
npm run compile
```

## 6. Start Local Frontend

```bash
cd frontend
npm run dev
```

Open:

- http://localhost:3000

## 7. Deployments

Status Sepolia deployment:

```bash
npm run deploy:status
```

Arbitrum Sepolia deployment:

```bash
npm run deploy:arbitrum
```

Deployment artifacts are written in:

- deployments/status-sepolia-deployment.json
- deployments/arbitrum-deployment.json
- deployments/arbitrum-deployment.testnet.json

## 8. Useful Commands

Compile:

```bash
npm run compile
```

Run all tests:

```bash
npm run test
```

Run status fork tests:

```bash
npm run test:fork:status
```

Run arbitrum fork tests:

```bash
npm run test:fork:arbitrum
```

Build frontend:

```bash
cd frontend
npm run build
```
