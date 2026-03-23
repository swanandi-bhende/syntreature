import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import styles from "../styles/Home.module.css";
import { NETWORKS, getNetworkConfig, NL_TRADING_ESCROW_ABI } from "../lib/contracts";

interface Demand {
  id: string;
  nlDescription: string;
  collateralAmount: string;
  tradeType: string;
  asset: string;
  priceThreshold: string;
  settled: boolean;
}

type TxStatus = "pending" | "submitted" | "confirmed" | "failed";

interface TxRecord {
  id: string;
  step: string;
  txHash: string;
  status: TxStatus;
  blockNumber?: number;
  timestamp?: string;
  explorerUrl: string;
  error?: string;
}

function parseDemandFromNl(nlDescription: string) {
  const collateralMatch = nlDescription.match(/(\d+(?:\.\d+)?)\s*ETH/i);
  const priceMatch = nlDescription.match(/(?:>|above|over)\s*\$?(\d+(?:\.\d+)?)/i);
  const sizeMatch = nlDescription.match(/size\s*\$?(\d+(?:\.\d+)?)/i);
  const assetMatch = nlDescription.match(/\b(ETH|BTC|ARB|SOL)\b/i);

  const collateralAmountEth = collateralMatch?.[1] ?? "0.01";
  const tradeType = /\bshort\b/i.test(nlDescription) ? "short" : "long";
  const asset = (assetMatch?.[1] ?? "ETH").toUpperCase();
  const priceThreshold = Math.max(1, Math.floor(Number(priceMatch?.[1] ?? "3200")));
  const sizeUsd = Math.max(1, Math.floor(Number(sizeMatch?.[1] ?? "1000")));

  return {
    collateralAmountEth,
    tradeType,
    asset,
    priceThreshold,
    sizeUsd,
  };
}

function toUserFacingError(error: unknown) {
  const normalized = error as { code?: number; message?: string; reason?: string };
  const reasonText = normalized.reason || normalized.message || "Transaction failed.";

  if (normalized.code === 4001 || /user rejected/i.test(reasonText)) {
    return "User rejected signature.";
  }

  if (/onlyagent|unauthorized|not authorized/i.test(reasonText)) {
    return "Unauthorized wallet for onlyAgent function.";
  }

  return reasonText;
}

function shortHash(hash: string) {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

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

export default function Home() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [nlInput, setNlInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);
  const [chainName, setChainName] = useState("Not connected");
  const [connectError, setConnectError] = useState("");
  const [createDemandStatus, setCreateDemandStatus] = useState<TxStatus | "idle">("idle");
  const [createDemandError, setCreateDemandError] = useState("");
  const [latestTxHash, setLatestTxHash] = useState("");
  const [latestExplorerUrl, setLatestExplorerUrl] = useState("");
  const [latestBlockNumber, setLatestBlockNumber] = useState<number | null>(null);
  const [latestTimestamp, setLatestTimestamp] = useState("");
  const [txRecords, setTxRecords] = useState<TxRecord[]>([]);

  const statusSepoliaChainId = NETWORKS.statusSepolia.chainId;
  const arbitrumSepoliaChainId = NETWORKS.arbitrumSepolia.chainId;
  const expectedAgentAddress = (process.env.NEXT_PUBLIC_AGENT_ADDRESS || "").toLowerCase();
  const escrowAddressStatus = process.env.NEXT_PUBLIC_ESCROW_ADDRESS_STATUS || "";
  const arbiterAddressStatus = process.env.NEXT_PUBLIC_ARBITER_ADDRESS_STATUS || "";
  const collateralTokenStatus = process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_STATUS || "";
  const gmxAddressArbitrum = process.env.NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM || "";
  const isCorrectNetwork = chainId === statusSepoliaChainId;
  const isAuthorizedAgent =
    !!walletAddress && !!expectedAgentAddress && walletAddress.toLowerCase() === expectedAgentAddress;

  const missingContractConfigs: string[] = [];
  if (!escrowAddressStatus) missingContractConfigs.push("NEXT_PUBLIC_ESCROW_ADDRESS_STATUS");
  if (!arbiterAddressStatus) missingContractConfigs.push("NEXT_PUBLIC_ARBITER_ADDRESS_STATUS");
  if (!collateralTokenStatus) missingContractConfigs.push("NEXT_PUBLIC_COLLATERAL_TOKEN_STATUS");

  const canAttemptWrite =
    isConnected &&
    !!signer &&
    isCorrectNetwork &&
    isAuthorizedAgent &&
    missingContractConfigs.length === 0;

  const guardrailReasons: string[] = [];
  if (!isConnected) {
    guardrailReasons.push("Connect wallet before write actions.");
  }
  if (isConnected && !isCorrectNetwork) {
    guardrailReasons.push(
      `Wrong network. Switch to ${NETWORKS.statusSepolia.name} (chainId ${statusSepoliaChainId}) for escrow write actions.`
    );
  }
  if (isConnected && !isAuthorizedAgent) {
    guardrailReasons.push("Wallet not authorized as agent for onlyAgent write actions.");
  }
  if (missingContractConfigs.length > 0) {
    guardrailReasons.push(
      `Missing contract address config: ${missingContractConfigs.join(", ")}.`
    );
  }

  const applyDisconnectedState = () => {
    setProvider(null);
    setSigner(null);
    setWalletAddress("");
    setIsConnected(false);
    setChainId(null);
    setChainName("Not connected");
  };

  const syncWalletState = async (browserProvider: ethers.BrowserProvider) => {
    try {
      const accounts = (await browserProvider.send("eth_accounts", [])) as string[];
      const network = await browserProvider.getNetwork();
      const nextChainId = Number(network.chainId);
      const networkConfig = getNetworkConfig(nextChainId);

      setChainId(nextChainId);
      setChainName(networkConfig?.name || `Chain ${nextChainId}`);

      if (accounts.length === 0) {
        applyDisconnectedState();
        return;
      }

      const nextSigner = await browserProvider.getSigner();
      const address = await nextSigner.getAddress();

      setProvider(browserProvider);
      setSigner(nextSigner);
      setWalletAddress(address);
      setIsConnected(true);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "Failed to sync wallet state.");
    }
  };

  const connectWallet = async () => {
    setConnectError("");
    if (!window.ethereum) {
      setConnectError("No browser wallet found. Install MetaMask or a compatible wallet.");
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      await syncWalletState(browserProvider);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  };

  const switchToStatusSepolia = async () => {
    setConnectError("");
    if (!window.ethereum) {
      setConnectError("No browser wallet found.");
      return;
    }

    const chainHex = `0x${statusSepoliaChainId.toString(16)}`;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }],
      });
      const browserProvider = provider || new ethers.BrowserProvider(window.ethereum);
      await syncWalletState(browserProvider);
    } catch (error) {
      const addChainCode = 4902;
      const errorCode = (error as { code?: number })?.code;

      if (errorCode === addChainCode) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainHex,
                chainName: NETWORKS.statusSepolia.name,
                nativeCurrency: {
                  name: "ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: [NETWORKS.statusSepolia.rpc],
                blockExplorerUrls: [NETWORKS.statusSepolia.explorer],
              },
            ],
          });
          const browserProvider = provider || new ethers.BrowserProvider(window.ethereum);
          await syncWalletState(browserProvider);
          return;
        } catch (addError) {
          setConnectError(
            addError instanceof Error ? addError.message : "Failed to add Status Sepolia network."
          );
          return;
        }
      }

      setConnectError(error instanceof Error ? error.message : "Network switch failed.");
    }
  };

  const disconnectWallet = () => {
    setConnectError("");
    applyDisconnectedState();
  };

  // Fetch user's demands on component mount
  useEffect(() => {
    // In production: fetch from contract
    console.log("Fetching demands...");
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    void syncWalletState(browserProvider);

    const handleAccountsChanged = (accountsValue: unknown) => {
      const accounts = Array.isArray(accountsValue) ? (accountsValue as string[]) : [];
      if (accounts.length === 0) {
        disconnectWallet();
        return;
      }

      void syncWalletState(browserProvider);
    };

    const handleChainChanged = () => {
      void syncWalletState(browserProvider);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const handleCreateDemand = async () => {
    if (!canAttemptWrite) return;
    if (!nlInput.trim()) return;
    if (!provider || !signer) return;

    const releaseTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const parsed = parseDemandFromNl(nlInput);
    const collateralAmount = ethers.parseUnits(parsed.collateralAmountEth, 18);

    const pendingRecordId = `create-demand-${Date.now()}`;
    setCreateDemandStatus("pending");
    setCreateDemandError("");
    setLatestTxHash("");
    setLatestExplorerUrl("");
    setLatestBlockNumber(null);
    setLatestTimestamp("");

    setTxRecords((prev) => [
      {
        id: pendingRecordId,
        step: "createDemand",
        txHash: "awaiting-signature",
        status: "pending",
        explorerUrl: "",
      },
      ...prev,
    ]);

    setIsLoading(true);
    try {
      const escrowContract = new ethers.Contract(
        escrowAddressStatus,
        NL_TRADING_ESCROW_ABI,
        signer
      );

      const tx = await escrowContract.createDemand(
        nlInput,
        collateralTokenStatus,
        collateralAmount,
        parsed.tradeType,
        parsed.asset,
        BigInt(parsed.priceThreshold),
        BigInt(parsed.sizeUsd),
        BigInt(releaseTime)
      );

      const explorerUrl = `${NETWORKS.statusSepolia.explorer}/tx/${tx.hash}`;
      setCreateDemandStatus("submitted");
      setLatestTxHash(tx.hash);
      setLatestExplorerUrl(explorerUrl);

      setTxRecords((prev) => {
        const next = [...prev];
        const index = next.findIndex((record) => record.id === pendingRecordId);
        const submittedRecord: TxRecord = {
          id: pendingRecordId,
          step: "createDemand",
          txHash: tx.hash,
          status: "submitted",
          explorerUrl,
        };
        if (index >= 0) {
          next[index] = submittedRecord;
        } else {
          next.unshift(submittedRecord);
        }
        return next;
      });

      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        const blockNumber = Number(receipt.blockNumber);
        const block = await provider.getBlock(blockNumber);
        const timestampIso = block?.timestamp
          ? new Date(Number(block.timestamp) * 1000).toISOString()
          : "";

        setCreateDemandStatus("confirmed");
        setLatestBlockNumber(blockNumber);
        setLatestTimestamp(timestampIso);

        setTxRecords((prev) =>
          prev.map((record) =>
            record.id === pendingRecordId
              ? {
                  ...record,
                  status: "confirmed",
                  blockNumber,
                  timestamp: timestampIso,
                }
              : record
          )
        );

        const newDemand: Demand = {
          id: Date.now().toString(),
          nlDescription: nlInput,
          collateralAmount: parsed.collateralAmountEth,
          tradeType: parsed.tradeType,
          asset: parsed.asset,
          priceThreshold: String(parsed.priceThreshold),
          settled: false,
        };

        setDemands((prev) => [newDemand, ...prev]);
        setNlInput("");
      } else {
        throw new Error("Transaction reverted before confirmation.");
      }
    } catch (error) {
      const userFacingError = toUserFacingError(error);
      setCreateDemandStatus("failed");
      setCreateDemandError(userFacingError);

      setTxRecords((prev) =>
        prev.map((record) =>
          record.id === pendingRecordId
            ? {
                ...record,
                status: "failed",
                error: userFacingError,
              }
            : record
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>🦖 Syntreature</h1>
        <p>Gasless NL Trading Escrow Agent</p>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2>Wallet Execution Context</h2>
          <div className={styles.requiredChains}>
            <div>
              <span className={styles.label}>Escrow flow chain:</span>
              <span>
                {NETWORKS.statusSepolia.name} ({statusSepoliaChainId})
              </span>
            </div>
            <div>
              <span className={styles.label}>GMX evidence chain:</span>
              <span>
                {NETWORKS.arbitrumSepolia.name} ({arbitrumSepoliaChainId})
              </span>
            </div>
            <div>
              <span className={styles.label}>GMX manager config:</span>
              <span>{gmxAddressArbitrum ? "Present" : "Missing (read-only evidence will be limited)"}</span>
            </div>
          </div>

          <div className={styles.walletActionsRow}>
            <button onClick={connectWallet} className={styles.button}>
              Connect Wallet
            </button>
            <button onClick={switchToStatusSepolia} className={styles.buttonSecondary}>
              Switch to Status Sepolia
            </button>
            <button onClick={disconnectWallet} className={styles.buttonGhost}>
              Disconnect
            </button>
          </div>

          {connectError && <p className={styles.connectError}>{connectError}</p>}

          <div className={styles.statusChips}>
            <span className={`${styles.chip} ${isConnected ? styles.chipPass : styles.chipFail}`}>
              Wallet: {isConnected ? "Connected" : "Not connected"}
            </span>
            <span className={`${styles.chip} ${isCorrectNetwork ? styles.chipPass : styles.chipWarn}`}>
              Network: {isCorrectNetwork ? "Correct" : "Wrong"}
            </span>
            <span className={`${styles.chip} ${isAuthorizedAgent ? styles.chipPass : styles.chipWarn}`}>
              Agent role: {isAuthorizedAgent ? "Authorized agent" : "Read-only wallet"}
            </span>
          </div>

          <div className={styles.walletMeta}>
            <div>
              <span className={styles.label}>Address:</span>
              <span>{walletAddress || "-"}</span>
            </div>
            <div>
              <span className={styles.label}>Chain ID:</span>
              <span>{chainId ?? "-"}</span>
            </div>
            <div>
              <span className={styles.label}>Chain:</span>
              <span>{chainName}</span>
            </div>
            <div>
              <span className={styles.label}>Signer Ready:</span>
              <span>{signer ? "Yes" : "No"}</span>
            </div>
            <div>
              <span className={styles.label}>Provider Ready:</span>
              <span>{provider ? "Yes" : "No"}</span>
            </div>
          </div>
        </section>

        {/* Create Demand Section */}
        <section className={styles.section}>
          <h2>Create NL Demand</h2>
          {!canAttemptWrite && (
            <div className={styles.guardrailBox}>
              <h3>Write Guardrails Active</h3>
              <ul className={styles.guardrailList}>
                {guardrailReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {!isCorrectNetwork && isConnected && (
                <button onClick={switchToStatusSepolia} className={styles.buttonSecondary}>
                  Switch to Status Sepolia
                </button>
              )}
            </div>
          )}

          <textarea
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder="E.g., Lock 0.01 ETH and open long ETH on GMX if price > 3200 within 24h"
            rows={4}
            className={styles.textarea}
          />
          <button
            onClick={handleCreateDemand}
            disabled={isLoading || !canAttemptWrite || !nlInput.trim()}
            className={styles.button}
          >
            {createDemandStatus === "pending"
              ? "Awaiting wallet signature..."
              : createDemandStatus === "submitted"
                ? "Waiting for confirmation..."
                : isLoading
                  ? "Creating..."
                  : "Create Demand"}
          </button>

          {createDemandStatus !== "idle" && (
            <div className={styles.txLifecycleBox}>
              <div className={styles.txLifecycleHeader}>
                <strong>Create Demand Lifecycle:</strong>
                <span
                  className={`${styles.txStatusBadge} ${
                    createDemandStatus === "confirmed"
                      ? styles.txStatusSuccess
                      : createDemandStatus === "failed"
                        ? styles.txStatusFail
                        : styles.txStatusPending
                  }`}
                >
                  {createDemandStatus}
                </span>
              </div>

              {latestTxHash && (
                <p className={styles.txRow}>
                  Tx Hash: {shortHash(latestTxHash)}{" "}
                  {latestExplorerUrl && (
                    <a href={latestExplorerUrl} target="_blank" rel="noopener noreferrer">
                      view explorer
                    </a>
                  )}
                </p>
              )}

              {latestBlockNumber && (
                <p className={styles.txRow}>Block Number: {latestBlockNumber}</p>
              )}

              {latestTimestamp && (
                <p className={styles.txRow}>Timestamp: {latestTimestamp}</p>
              )}

              {createDemandError && (
                <p className={styles.txError}>Failure reason: {createDemandError}</p>
              )}
            </div>
          )}

          <div className={styles.txRecordsSection}>
            <h3>Transaction Records</h3>
            {txRecords.length === 0 ? (
              <p className={styles.empty}>No transaction records yet</p>
            ) : (
              <div className={styles.txRecordsList}>
                {txRecords.map((record) => (
                  <div key={record.id} className={styles.txRecordCard}>
                    <div className={styles.txRecordTop}>
                      <span className={styles.txStep}>{record.step}</span>
                      <span
                        className={`${styles.txStatusBadge} ${
                          record.status === "confirmed"
                            ? styles.txStatusSuccess
                            : record.status === "failed"
                              ? styles.txStatusFail
                              : styles.txStatusPending
                        }`}
                      >
                        {record.status}
                      </span>
                    </div>
                    <div className={styles.txRecordLine}>Tx: {shortHash(record.txHash)}</div>
                    <div className={styles.txRecordLine}>Block: {record.blockNumber ?? "-"}</div>
                    <div className={styles.txRecordLine}>Time: {record.timestamp || "-"}</div>
                    <div className={styles.txRecordLine}>
                      Explorer:{" "}
                      {record.explorerUrl ? (
                        <a href={record.explorerUrl} target="_blank" rel="noopener noreferrer">
                          open
                        </a>
                      ) : (
                        "-"
                      )}
                    </div>
                    {record.error && <div className={styles.txError}>Error: {record.error}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Active Demands Section */}
        <section className={styles.section}>
          <h2>Active Demands</h2>
          {demands.length === 0 ? (
            <p className={styles.empty}>No demands created yet</p>
          ) : (
            <div className={styles.demandsList}>
              {demands.map((demand) => (
                <div key={demand.id} className={styles.demandCard}>
                  <div className={styles.demandHeader}>
                    <h3>{demand.asset}</h3>
                    <span className={styles.status}>
                      {demand.settled ? "✓ Settled" : "⏳ Active"}
                    </span>
                  </div>
                  <p className={styles.description}>
                    {demand.nlDescription}
                  </p>
                  <div className={styles.demandDetails}>
                    <div>
                      <span className={styles.label}>Type:</span>
                      <span>{demand.tradeType}</span>
                    </div>
                    <div>
                      <span className={styles.label}>Collateral:</span>
                      <span>{demand.collateralAmount} ETH</span>
                    </div>
                    <div>
                      <span className={styles.label}>Price Threshold:</span>
                      <span>${demand.priceThreshold}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agent Status Section */}
        <section className={styles.section}>
          <h2>Agent Status</h2>
          <div className={styles.statusBox}>
            <div className={styles.statusItem}>
              <span>Agent ID:</span>
              <span className={styles.value}>1 (ERC-8004)</span>
            </div>
            <div className={styles.statusItem}>
              <span>Credit Score:</span>
              <span className={styles.value}>500/1000</span>
            </div>
            <div className={styles.statusItem}>
              <span>Successful Trades:</span>
              <span className={styles.value}>0</span>
            </div>
            <div className={styles.statusItem}>
              <span>Network:</span>
              <span className={styles.value}>Status Sepolia (Gasless)</span>
            </div>
          </div>
        </section>

        {/* Network Information */}
        <section className={styles.section}>
          <h2>Network Info</h2>
          <div className={styles.networkInfo}>
            <div className={styles.chain}>
              <h3>Status Network Sepolia</h3>
              <p>🟢 Gasless Escrow</p>
              <code>https://public.sepolia.rpc.status.network</code>
            </div>
            <div className={styles.chain}>
              <h3>Arbitrum Sepolia</h3>
              <p>📈 Live GMX Trading</p>
              <code>https://sepolia-rollup.arbitrum.io/rpc</code>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>Built for Synthesis Hackathon 2026</p>
        <p>
          <a href="https://github.com/swanandi-bhende/syntreature" target="_blank" rel="noopener noreferrer">
            GitHub Repository
          </a>
        </p>
      </footer>
    </div>
  );
}
