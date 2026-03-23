# Syntreature

Syntreature is a verifiable agent-commerce project built around three core primitives:

- Natural-language demand creation and escrow lifecycle management
- AI-evaluated arbitration with reputation-aware decisions
- Trade-to-credit linkage for score updates

## Documentation

- Setup and environment configuration: [setup.md](setup.md)
- Test execution and suite overview: [tests.md](tests.md)
- Product demo flow: [demo.md](demo.md)

## Track Integrations

- Status track integration and qualification: [status-track.md](status-track.md)
- bond.credit track integration and qualification: [bond-credit-track.md](bond-credit-track.md)
- Arkhai tracks integration and qualification: [arkhai-track.md](arkhai-track.md)

## Core Components

- Escrow contract: contracts/escrow/NLTradingEscrow.sol
- Arbiter contract: contracts/arbiters/AIEvaluatedArbiter.sol
- GMX position manager: contracts/gmx/GMXPositionManager.sol
- Frontend app: frontend/pages/index.tsx

## Proof Artifacts

- Status deployment and lifecycle proof: [deployments/status-sepolia-deployment.json](deployments/status-sepolia-deployment.json)
- Arbitrum testnet wrapper proof: [deployments/arbitrum-deployment.testnet.json](deployments/arbitrum-deployment.testnet.json)
- Arbitrum deployment artifact: [deployments/arbitrum-deployment.json](deployments/arbitrum-deployment.json)

## License

GPL-3.0. See [LICENSE](LICENSE).
