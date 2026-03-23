import { ethers } from "ethers";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

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

export type NetworkKey = "statusSepolia" | "arbitrumSepolia";

export interface NetworkConfig {
  key: NetworkKey;
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  gasless: boolean;
}

const statusChainId = Number(process.env.NEXT_PUBLIC_STATUS_CHAIN_ID || "1660990954");
const arbitrumChainId = Number(process.env.NEXT_PUBLIC_ARBITRUM_CHAIN_ID || "421614");

// Network configurations + explorer bases
export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  statusSepolia: {
    key: "statusSepolia",
    name: "Status Network Sepolia",
    chainId: statusChainId,
    rpc: process.env.NEXT_PUBLIC_STATUS_RPC || "https://public.sepolia.rpc.status.network",
    explorer: process.env.NEXT_PUBLIC_STATUS_EXPLORER || "https://sepoliascan.status.network",
    gasless: true,
  },
  arbitrumSepolia: {
    key: "arbitrumSepolia",
    name: "Arbitrum Sepolia",
    chainId: arbitrumChainId,
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: process.env.NEXT_PUBLIC_ARBITRUM_EXPLORER || "https://sepolia.arbiscan.io",
    gasless: false,
  },
};

const CONTRACT_ENV_KEYS = {
  escrowStatus: "NEXT_PUBLIC_ESCROW_ADDRESS_STATUS",
  arbiterStatus: "NEXT_PUBLIC_ARBITER_ADDRESS_STATUS",
  gmxArbitrum: "NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM",
  collateralStatus: "NEXT_PUBLIC_COLLATERAL_TOKEN_STATUS",
  agent: "NEXT_PUBLIC_AGENT_ADDRESS",
} as const;

export type ContractConfigKey = keyof typeof CONTRACT_ENV_KEYS;

const CONTRACT_ENV_VALUES: Record<ContractConfigKey, string> = {
  escrowStatus: process.env.NEXT_PUBLIC_ESCROW_ADDRESS_STATUS || "",
  arbiterStatus: process.env.NEXT_PUBLIC_ARBITER_ADDRESS_STATUS || "",
  gmxArbitrum: process.env.NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM || "",
  collateralStatus: process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_STATUS || "",
  agent: process.env.NEXT_PUBLIC_AGENT_ADDRESS || "",
};

export const DEPLOYMENTS = {
  statusSepolia: {
    NLTradingEscrow: process.env.NEXT_PUBLIC_ESCROW_ADDRESS_STATUS || "",
    AIEvaluatedArbiter: process.env.NEXT_PUBLIC_ARBITER_ADDRESS_STATUS || "",
    CollateralToken: process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_STATUS || "",
  },
  arbitrumSepolia: {
    GMXPositionManager: process.env.NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM || "",
  },
};

export function getNetworkConfig(chainId: number) {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}

export function isSupportedChain(chainId: number | null | undefined) {
  if (!chainId) return false;
  return Object.values(NETWORKS).some((n) => n.chainId === chainId);
}

function assertAddress(value: string, label: string) {
  if (!value) {
    throw new Error(`Missing required env: ${label}`);
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address for ${label}: ${value}`);
  }
  return value;
}

export function getContractAddress(key: ContractConfigKey) {
  const envKey = CONTRACT_ENV_KEYS[key];
  const value = CONTRACT_ENV_VALUES[key];
  return assertAddress(value, envKey);
}

export function getMissingContractEnvKeys(keys: ContractConfigKey[]) {
  return keys
    .filter((key) => !CONTRACT_ENV_VALUES[key])
    .map((key) => CONTRACT_ENV_KEYS[key]);
}

export function toExplorerTxUrl(chainId: number, txHash: string) {
  const network = getNetworkConfig(chainId);
  if (!network) {
    throw new Error(`Unsupported chain for tx explorer URL: ${chainId}`);
  }
  return `${network.explorer}/tx/${txHash}`;
}

export function toExplorerAddressUrl(chainId: number, address: string) {
  const network = getNetworkConfig(chainId);
  if (!network) {
    throw new Error(`Unsupported chain for address explorer URL: ${chainId}`);
  }
  return `${network.explorer}/address/${address}`;
}

export function isExpectedAgent(walletAddress: string) {
  const expectedAddress = getContractAddress("agent");
  return expectedAddress.toLowerCase() === walletAddress.toLowerCase();
}

function getInjectedProvider() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet found. Install MetaMask or a compatible wallet.");
  }
  return window.ethereum;
}

export function getProvider() {
  return new ethers.BrowserProvider(getInjectedProvider());
}

export async function getSigner(provider?: ethers.BrowserProvider) {
  const safeProvider = provider || getProvider();
  return safeProvider.getSigner();
}

export function getEscrowContract(runner: ethers.ContractRunner) {
  return new ethers.Contract(getContractAddress("escrowStatus"), NL_TRADING_ESCROW_ABI, runner);
}

export function getArbiterContract(runner: ethers.ContractRunner) {
  return new ethers.Contract(getContractAddress("arbiterStatus"), AI_EVALUATED_ARBITER_ABI, runner);
}

type DeploymentMap = Record<string, Record<string, string>>;

export function getDeployment(network: string, contract: string): string | undefined {
  const deployments = DEPLOYMENTS as DeploymentMap;
  return deployments[network]?.[contract];
}
