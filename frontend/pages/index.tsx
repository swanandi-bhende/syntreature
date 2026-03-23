import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import styles from "../styles/Home.module.css";
import { NETWORKS, getNetworkConfig } from "../lib/contracts";

interface Demand {
  id: string;
  nlDescription: string;
  collateralAmount: string;
  tradeType: string;
  asset: string;
  priceThreshold: string;
  settled: boolean;
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

  const statusSepoliaChainId = NETWORKS.statusSepolia.chainId;
  const expectedAgentAddress = (process.env.NEXT_PUBLIC_AGENT_ADDRESS || "").toLowerCase();
  const isCorrectNetwork = chainId === statusSepoliaChainId;
  const isAuthorizedAgent =
    !!walletAddress && !!expectedAgentAddress && walletAddress.toLowerCase() === expectedAgentAddress;

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
    if (!nlInput.trim()) return;

    setIsLoading(true);
    try {
      // In production: call contract createDemand()
      console.log("Creating demand:", nlInput);

      // Simulate API call
      setTimeout(() => {
        const newDemand: Demand = {
          id: Date.now().toString(),
          nlDescription: nlInput,
          collateralAmount: "0.01",
          tradeType: "long",
          asset: "ETH",
          priceThreshold: "3200",
          settled: false,
        };

        setDemands([...demands, newDemand]);
        setNlInput("");
      }, 1000);
    } catch (error) {
      console.error("Error creating demand:", error);
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
          <textarea
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder="E.g., Lock 0.01 ETH and open long ETH on GMX if price > 3200 within 24h"
            rows={4}
            className={styles.textarea}
          />
          <button
            onClick={handleCreateDemand}
            disabled={isLoading}
            className={styles.button}
          >
            {isLoading ? "Creating..." : "Create Demand"}
          </button>
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
