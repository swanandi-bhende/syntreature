// Deployment metadata will be saved here after running npm run deploy:status and npm run deploy:arbitrum
//
// Files:
// - status-sepolia-deployment.json  (gasless deployment + 3 tx proofs)
// - arbitrum-deployment.json         (GMX position manager)
//
// Each file contains:
// - Contract addresses
// - Transaction hashes
// - Gas usage
// - Network configuration
// - Deployment timestamp

// Example (Status Sepolia):
{
  "network": "Status Network Sepolia",
  "chainId": 1660990954,
  "rpc": "https://public.sepolia.rpc.status.network",
  "deployer": "0x...",
  "timestamp": "2026-03-22T10:00:00Z",
  "contracts": {
    "NLTradingEscrow": "0x...",
    "AIEvaluatedArbiter": "0x...",
    "MockAlkahest": "0x...",
    "MockERC8004": "0x..."
  },
  "transactions": {
    "tokenApproval": "0x...",
    "createDemand": "0x...",
    "lockFunds": "0x...",
    "requestArbitration": "0x..."
  },
  "gasUsed": {
    "createDemand": "0",
    "lockFunds": "0",
    "requestArbitration": "0"
  }
}
