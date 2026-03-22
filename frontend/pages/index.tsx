import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import styles from "../styles/Home.module.css";

interface Demand {
  id: string;
  nlDescription: string;
  collateralAmount: string;
  tradeType: string;
  asset: string;
  priceThreshold: string;
  settled: boolean;
}

export default function Home() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [nlInput, setNlInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch user's demands on component mount
  useEffect(() => {
    // In production: fetch from contract
    console.log("Fetching demands...");
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
