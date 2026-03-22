// Contract ABIs and utilities
export const NL_TRADING_ESCROW_ABI = [
  "function createDemand(string memory nlDescription, address collateralToken, uint256 collateralAmount, string memory tradeType, string memory asset, uint256 priceThreshold, uint256 sizeUsd, uint256 releaseTime) external returns (uint256)",
  "function lockFunds(uint256 demandId) external",
  "function releaseFunds(uint256 demandId) external",
  "function getUserDemands(address user) external view returns (uint256[])",
  "function getDemand(uint256 demandId) external view returns (tuple(uint256,address,string,address,uint256,string,string,uint256,uint256,uint256,bool,uint256))",
];

export const AI_EVALUATED_ARBITER_ABI = [
  "function requestArbitration(address escrow, uint256 obligationId, address agent, uint256 agentId, string memory nlCondition) external returns (uint256)",
  "function evaluateCondition(uint256 caseId, bool shouldRelease, bytes calldata proof) external",
  "function getCase(uint256 caseId) external view returns (tuple(uint256,address,uint256,address,uint256,string,bytes,bool,bool,uint256,uint256))",
  "function getReputation(address agent) external view returns (tuple(uint256,address,uint256,uint256,uint256,uint256))",
];

// Network configurations
export const NETWORKS = {
  statusSepolia: {
    name: "Status Network Sepolia",
    chainId: 1660990954,
    rpc: "https://public.sepolia.rpc.status.network",
    explorer: "https://sepoliascan.status.network",
    gasless: true,
  },
  arbitrumSepolia: {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    gasless: false,
  },
};

// Track all contract deployments
export const DEPLOYMENTS = {
  statusSepolia: {
    NLTradingEscrow: process.env.NEXT_PUBLIC_ESCROW_ADDRESS_STATUS || "",
    AIEvaluatedArbiter: process.env.NEXT_PUBLIC_ARBITER_ADDRESS_STATUS || "",
    MockAlkahest: process.env.NEXT_PUBLIC_ALKAHEST_ADDRESS_STATUS || "",
    MockERC8004: process.env.NEXT_PUBLIC_ERC8004_ADDRESS_STATUS || "",
  },
  arbitrumSepolia: {
    GMXPositionManager: process.env.NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM || "",
  },
};

export function getNetworkConfig(chainId: number) {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}

export function getDeployment(network: string, contract: string) {
  return DEPLOYMENTS[network as keyof typeof DEPLOYMENTS]?.[
    contract as any
  ];
}
