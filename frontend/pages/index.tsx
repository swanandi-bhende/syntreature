import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import styles from "../styles/Home.module.css";
import {
  NETWORKS,
  getNetworkConfig,
  getProvider,
  getSigner,
  getEscrowContract,
  toExplorerTxUrl,
  toExplorerAddressUrl,
  isExpectedAgent,
  isSupportedChain,
  getMissingContractEnvKeys,
} from "../lib/contracts";

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

const DETERMINISTIC_ERROR_COPY = {
  userRejected: "User rejected signature",
  wrongNetwork: "Wrong network",
  unauthorizedOnlyAgent: "Unauthorized wallet for onlyAgent function",
  missingEnv: "Missing env config",
} as const;

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
    return DETERMINISTIC_ERROR_COPY.userRejected;
  }

  if (/onlyagent|unauthorized|not authorized/i.test(reasonText)) {
    return DETERMINISTIC_ERROR_COPY.unauthorizedOnlyAgent;
  }

  return reasonText;
}

function isUserRejectedError(error: unknown) {
  const normalized = error as {
    code?: number;
    message?: string;
    reason?: string;
    info?: { error?: { code?: number; message?: string } };
  };

  const reasonText =
    normalized.reason ||
    normalized.message ||
    normalized.info?.error?.message ||
    "";
  const code = normalized.code ?? normalized.info?.error?.code;

  return code === 4001 || /user denied|user rejected/i.test(reasonText);
}

function shortHash(hash: string) {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
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
  const [proofLinkOpened, setProofLinkOpened] = useState(false);
  const [hasApprovedConnection, setHasApprovedConnection] = useState(false);

  const statusSepoliaChainId = NETWORKS.statusSepolia.chainId;
  const arbitrumSepoliaChainId = NETWORKS.arbitrumSepolia.chainId;
  const collateralTokenStatus = process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_STATUS || "";
  const escrowAddressStatus = process.env.NEXT_PUBLIC_ESCROW_ADDRESS_STATUS || "";
  const arbiterAddressStatus = process.env.NEXT_PUBLIC_ARBITER_ADDRESS_STATUS || "";
  const gmxAddressArbitrum = process.env.NEXT_PUBLIC_GMX_ADDRESS_ARBITRUM || "";
  const isCorrectNetwork = chainId === statusSepoliaChainId;
  const isAuthorizedAgent = (() => {
    if (!walletAddress) return false;
    try {
      return isExpectedAgent(walletAddress);
    } catch {
      return false;
    }
  })();

  const missingContractConfigs = getMissingContractEnvKeys([
    "escrowStatus",
    "arbiterStatus",
    "collateralStatus",
    "agent",
  ]);

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
      `${DETERMINISTIC_ERROR_COPY.wrongNetwork}: switch to ${NETWORKS.statusSepolia.name} (chainId ${statusSepoliaChainId}) for escrow write actions.`
    );
  }
  if (isConnected && !isAuthorizedAgent) {
    guardrailReasons.push(`${DETERMINISTIC_ERROR_COPY.unauthorizedOnlyAgent}.`);
  }
  if (missingContractConfigs.length > 0) {
    guardrailReasons.push(
      `${DETERMINISTIC_ERROR_COPY.missingEnv}: ${missingContractConfigs.join(", ")}.`
    );
  }

  const markProofLinkOpened = () => {
    setProofLinkOpened(true);
  };

  const hasCreateDemandSubmitted = txRecords.some(
    (record) =>
      record.step === "createDemand" && (record.status === "submitted" || record.status === "confirmed")
  );
  const hasCreateDemandConfirmed = txRecords.some(
    (record) => record.step === "createDemand" && record.status === "confirmed"
  );
  const judgeChecklist = [
    { key: "connect-wallet", label: "Wallet connected", passed: isConnected },
    { key: "correct-chain", label: "On Status Sepolia", passed: isCorrectNetwork },
    {
      key: "create-demand-submitted",
      label: "Demand tx submitted",
      passed: hasCreateDemandSubmitted,
    },
    {
      key: "create-demand-confirmed",
      label: "Demand tx confirmed",
      passed: hasCreateDemandConfirmed,
    },
    { key: "proof-link-opened", label: "Proof verified", passed: proofLinkOpened },
  ];
  const judgePassed = judgeChecklist.every((item) => item.passed);

  const applyDisconnectedState = () => {
    setProvider(null);
    setSigner(null);
    setWalletAddress("");
    setIsConnected(false);
    setChainId(null);
    setChainName("Not connected");
  };

  const syncWalletState = async (
    browserProvider: ethers.BrowserProvider,
    options?: { allowAutoConnect?: boolean; knownAccounts?: string[] }
  ) => {
    const allowAutoConnect = options?.allowAutoConnect ?? false;

    try {
      const accounts = options?.knownAccounts
        ? options.knownAccounts
        : ((await browserProvider.send("eth_accounts", [])) as string[]);
      const network = await browserProvider.getNetwork();
      const nextChainId = Number(network.chainId);
      const networkConfig = getNetworkConfig(nextChainId);

      setChainId(nextChainId);
      setChainName(networkConfig?.name || `Chain ${nextChainId}`);

      if (accounts.length === 0) {
        applyDisconnectedState();
        return;
      }

      if (!allowAutoConnect && !hasApprovedConnection) {
        setSigner(null);
        setWalletAddress("");
        setIsConnected(false);
        return;
      }

      const nextSigner = await getSigner(browserProvider);
      const address = await nextSigner.getAddress();

      setProvider(browserProvider);
      setSigner(nextSigner);
      setWalletAddress(address);
      setIsConnected(true);
    } catch (error) {
      if (isUserRejectedError(error)) {
        setConnectError("");
        applyDisconnectedState();
        return;
      }
      setConnectError(error instanceof Error ? error.message : "Failed to sync wallet state.");
    }
  };

  const connectWallet = async () => {
    setConnectError("");

    try {
      const browserProvider = getProvider();
      const requestedAccounts = (await browserProvider.send("eth_requestAccounts", [])) as string[];
      setHasApprovedConnection(true);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("syntreature.wallet.approved", "true");
      }
      await syncWalletState(browserProvider, {
        allowAutoConnect: true,
        knownAccounts: requestedAccounts,
      });
    } catch (error) {
      if (isUserRejectedError(error)) {
        setConnectError("Wallet connection request was rejected.");
        applyDisconnectedState();
        return;
      }
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
      const browserProvider = provider || getProvider();
      await syncWalletState(browserProvider, { allowAutoConnect: true });
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
          const browserProvider = provider || getProvider();
          await syncWalletState(browserProvider, { allowAutoConnect: true });
          return;
        } catch (addError) {
          setConnectError(
            addError instanceof Error ? addError.message : "Failed to add Status Sepolia network."
          );
          return;
        }
      }

      if (isUserRejectedError(error)) {
        setConnectError("Network switch request was rejected.");
        return;
      }

      setConnectError(error instanceof Error ? error.message : "Network switch failed.");
    }
  };

  const disconnectWallet = () => {
    setConnectError("");
    setHasApprovedConnection(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("syntreature.wallet.approved");
    }
    applyDisconnectedState();
  };

  useEffect(() => {
    console.log("Fetching demands...");
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const approvedFromSession =
      window.sessionStorage.getItem("syntreature.wallet.approved") === "true";
    setHasApprovedConnection(approvedFromSession);

    const browserProvider = getProvider();
    void syncWalletState(browserProvider, { allowAutoConnect: approvedFromSession });

    const handleAccountsChanged = (accountsValue: unknown) => {
      const accounts = Array.isArray(accountsValue) ? (accountsValue as string[]) : [];
      if (accounts.length === 0) {
        disconnectWallet();
        return;
      }

      setHasApprovedConnection(true);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("syntreature.wallet.approved", "true");
      }
      void syncWalletState(browserProvider, { allowAutoConnect: true });
    };

    const handleChainChanged = () => {
      void syncWalletState(browserProvider, { allowAutoConnect: hasApprovedConnection });
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [hasApprovedConnection]);

  useEffect(() => {
    if (isConnected && !isCorrectNetwork) {
      setConnectError(
        `${DETERMINISTIC_ERROR_COPY.wrongNetwork}: use \"Switch to Status Sepolia\" to continue.`
      );
    }
  }, [isConnected, isCorrectNetwork]);

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
      const escrowContract = getEscrowContract(signer);

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

      const explorerUrl = toExplorerTxUrl(statusSepoliaChainId, tx.hash);
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
        <h1>Verifiable Agent Commerce</h1>
        <p>Judge the proof of execution for AI-driven trading demands</p>
      </header>

      <main className={styles.main}>
        {/* Config Errors */}
        {missingContractConfigs.length > 0 && (
          <div className={styles.error}>
            Missing configuration: {missingContractConfigs.join(", ")}
          </div>
        )}

        {connectError && (
          <div className={styles.error}>
            {connectError}
          </div>
        )}

        {/* Proof Section */}
        <div className={styles.proofSection}>
          {/* Step 1: Connect & Create */}
          <div className={styles.stepCard}>
            <h2>1</h2>
            <h3>Connect Wallet & Create Demand</h3>

            <div className={styles.walletRow}>
              <button
                onClick={connectWallet}
                disabled={isLoading || hasApprovedConnection}
                className={styles.button}
              >
                {isConnected ? `Connected: ${shortHash(walletAddress)}` : "Connect Wallet"}
              </button>

              {isConnected && (
                <button onClick={disconnectWallet} className={styles.buttonGhost}>
                  Disconnect
                </button>
              )}
            </div>

            {!isCorrectNetwork && isConnected && (
              <button onClick={switchToStatusSepolia} className={styles.buttonSecondary} style={{ width: "100%" }}>
                Switch to Status Sepolia
              </button>
            )}

            <div className={styles.demandStatus}>
              <span className={`${styles.badge} ${isConnected ? styles.badgePass : ""}`}>
                {isConnected ? "✓ Connected" : "○ Not connected"}
              </span>
              <span className={`${styles.badge} ${isCorrectNetwork ? styles.badgePass : styles.badgeWarn}`}>
                {isCorrectNetwork ? "✓ Status Sepolia" : isConnected ? "✗ Wrong chain" : "○ Unknown"}
              </span>
            </div>

            {canAttemptWrite && isConnected && (
              <div>
                <textarea
                  value={nlInput}
                  onChange={(e) => setNlInput(e.target.value)}
                  placeholder="E.g., Lock 0.01 ETH and open long ETH on GMX if price > 3200 within 24h"
                  className={styles.textarea}
                />
                <button
                  onClick={handleCreateDemand}
                  disabled={isLoading || !nlInput.trim()}
                  className={styles.buttonLarge}
                >
                  {createDemandStatus === "pending"
                    ? "Awaiting wallet signature..."
                    : createDemandStatus === "submitted"
                      ? "Waiting for confirmation..."
                      : isLoading
                        ? "Creating..."
                        : "Create Demand"}
                </button>
              </div>
            )}

            {!canAttemptWrite && isConnected && (
              <div className={styles.error}>
                {guardrailReasons.map((reason) => (
                  <div key={reason}>• {reason}</div>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Proof & Verification */}
          <div className={styles.stepCard}>
            <h2>2</h2>
            <h3>Proof & Verification</h3>

            {latestTxHash && (
              <div className={styles.proofBox}>
                <div className={styles.proofStatus}>
                  <span
                    className={`${styles.statusBadge} ${
                      createDemandStatus === "confirmed"
                        ? styles.statusConfirmed
                        : styles.statusPending
                    }`}
                  >
                    {createDemandStatus === "confirmed" ? "✓ Confirmed" : "⏳ Pending"}
                  </span>
                </div>

                <div className={styles.proofDetail}>
                  <label>Transaction Hash</label>
                  <code>{latestTxHash}</code>
                </div>

                {latestBlockNumber && (
                  <div className={styles.proofDetail}>
                    <label>Block Number</label>
                    <span>{latestBlockNumber}</span>
                  </div>
                )}

                {latestTimestamp && (
                  <div className={styles.proofDetail}>
                    <label>Timestamp</label>
                    <span>{latestTimestamp}</span>
                  </div>
                )}

                {latestExplorerUrl && (
                  <a
                    href={latestExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={markProofLinkOpened}
                    className={styles.explorerLink}
                  >
                    View on Explorer →
                  </a>
                )}

                {createDemandError && (
                  <div className={styles.error}>
                    {createDemandError}
                  </div>
                )}
              </div>
            )}

            {!latestTxHash && isConnected && canAttemptWrite && (
              <div className={styles.proofBox} style={{ opacity: 0.5 }}>
                <p style={{ margin: 0, color: "rgba(31, 26, 28, 0.6)", fontSize: "1.1rem" }}>
                  Create a demand to see proof and verification details here.
                </p>
              </div>
            )}

            {txRecords.length > 0 && (
              <div className={styles.txHistory}>
                <label>Recent Transactions</label>
                {txRecords.slice(0, 3).map((record) => (
                  <div key={record.id} className={styles.txItem}>
                    <span className={styles.txLabel}>{record.step}</span>
                    <span className={styles.txStatus}>
                      {record.status === "confirmed"
                        ? "✓"
                        : record.status === "failed"
                          ? "✗"
                          : "⏳"}
                    </span>
                    {record.explorerUrl && (
                      <a
                        href={record.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={markProofLinkOpened}
                        className={styles.txLink}
                      >
                        explorer
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Checklist Section */}
        <div className={styles.checklistSection}>
          <h2>Judge Verification Checklist</h2>

          <div className={styles.checklistItems}>
            {judgeChecklist.map((item) => (
              <div key={item.key} className={styles.checklistItem}>
                <span className={item.passed ? styles.checkPassed : styles.checkFailed}>
                  {item.passed ? "✓" : "○"}
                </span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <div className={`${styles.summary} ${judgePassed ? styles.summaryPass : ""}`}>
            {judgePassed
              ? "✓ ALL CHECKS PASSED: Proof links opened and verified."
              : "○ INCOMPLETE: Complete all verification steps above."}
          </div>
        </div>
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
