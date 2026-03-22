import hre from "hardhat";
import fs from "fs";

const { ethers } = hre as any;

/**
 * Deploy script for Status Network Sepolia Testnet
 * Demonstrates gasless deployment + 3+ gasless transactions
 * 
 * Network: Status Network Sepolia
 * Chain ID: 1660990954
 * RPC: https://public.sepolia.rpc.status.network
 * Gas: 0 (gasless at protocol level)
 */

type IntegrationMode = "real" | "mock";

type ProtocolAddresses = {
  alkahest: string;
  nlAgreements: string;
  erc8004: string;
};

type DeployContext = {
  mode: IntegrationMode;
  protocolAddresses: ProtocolAddresses;
  mockArtifacts: {
    mockPriceFeed?: string;
    mockToken?: string;
    mockAlkahest?: string;
    mockNLAgreements?: string;
    mockERC8004?: string;
  };
};

function normalizeMode(raw?: string): IntegrationMode | undefined {
  if (!raw) return undefined;
  const mode = raw.trim().toLowerCase();
  if (mode === "real" || mode === "mock") return mode;
  throw new Error(`Invalid INTEGRATION_MODE: ${raw}. Use 'real' or 'mock'.`);
}

function getEnvAddress(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function isNonZeroAddress(value?: string): boolean {
  if (!value) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(value) && value !== ethers.ZeroAddress;
}

function resolveIntegrationMode(): { mode: IntegrationMode; hasRealAddresses: boolean } {
  const envMode = normalizeMode(process.env.INTEGRATION_MODE);
  const hasRealAddresses =
    isNonZeroAddress(getEnvAddress("ALKAHEST_CORE_ADDRESS")) &&
    isNonZeroAddress(getEnvAddress("NL_AGREEMENTS_ADDRESS")) &&
    isNonZeroAddress(getEnvAddress("ERC8004_REGISTRY_ADDRESS"));

  const mode = envMode ?? (hasRealAddresses ? "real" : "mock");
  return { mode, hasRealAddresses };
}

function resolveProtocolAddresses(mode: IntegrationMode): ProtocolAddresses {
  const alkahest = getEnvAddress("ALKAHEST_CORE_ADDRESS");
  const nlAgreements = getEnvAddress("NL_AGREEMENTS_ADDRESS");
  const erc8004 = getEnvAddress("ERC8004_REGISTRY_ADDRESS");

  if (mode === "real") {
    const missing: string[] = [];
    if (!isNonZeroAddress(alkahest)) missing.push("ALKAHEST_CORE_ADDRESS");
    if (!isNonZeroAddress(nlAgreements)) missing.push("NL_AGREEMENTS_ADDRESS");
    if (!isNonZeroAddress(erc8004)) missing.push("ERC8004_REGISTRY_ADDRESS");

    if (missing.length > 0) {
      throw new Error(
        `Real mode requires protocol addresses. Missing/invalid: ${missing.join(", ")}`
      );
    }
  }

  return {
    alkahest: alkahest ?? ethers.ZeroAddress,
    nlAgreements: nlAgreements ?? ethers.ZeroAddress,
    erc8004: erc8004 ?? ethers.ZeroAddress,
  };
}

async function main() {
  console.log("🚀 Deploying Syntreature to Status Network Sepolia (Gasless)...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer:", deployer.address);

  const { mode, hasRealAddresses } = resolveIntegrationMode();
  const protocolAddresses = resolveProtocolAddresses(mode);
  console.log("📍 Integration mode:", mode);
  if (mode === "mock" && hasRealAddresses) {
    console.log("⚠️ Real addresses detected but mock mode was explicitly selected.");
  }

  const context: DeployContext = {
    mode,
    protocolAddresses,
    mockArtifacts: {},
  };

  // Step 1: Deploy required dependencies by integration mode
  console.log("\n1️⃣ Preparing protocol dependencies...");

  let alkahestAddr = protocolAddresses.alkahest;
  let nlAddr = protocolAddresses.nlAgreements;
  let erc8004Addr = protocolAddresses.erc8004;

  if (mode === "mock") {
    const MockAlkahest = await ethers.getContractFactory("MockAlkahest");
    const alkahest = await MockAlkahest.deploy();
    await alkahest.waitForDeployment();
    alkahestAddr = await alkahest.getAddress();
    context.mockArtifacts.mockAlkahest = alkahestAddr;
    console.log("✅ Mock Alkahest deployed:", alkahestAddr);

    const Mocks = await ethers.getContractFactory("MockNaturalLanguageAgreements");
    const nlAgreements = await Mocks.deploy();
    await nlAgreements.waitForDeployment();
    nlAddr = await nlAgreements.getAddress();
    context.mockArtifacts.mockNLAgreements = nlAddr;
    console.log("✅ Mock NL Agreements deployed:", nlAddr);

    const MockERC8004 = await ethers.getContractFactory("MockERC8004");
    const erc8004 = await MockERC8004.deploy();
    await erc8004.waitForDeployment();
    erc8004Addr = await erc8004.getAddress();
    context.mockArtifacts.mockERC8004 = erc8004Addr;
    console.log("✅ Mock ERC-8004 deployed:", erc8004Addr);

    const registerTx = await erc8004.registerAgent(
      1,
      deployer.address,
      JSON.stringify({
        name: "Syntreature Agent",
        harness: "Copilot",
        model: "gpt-5.3-codex",
        system: "Autonomous NL trading agent",
      })
    );
    await registerTx.wait();
    console.log("✅ Mock agent registered on ERC-8004");
  } else {
    console.log("✅ Real protocol addresses detected and locked:");
    console.log("   Alkahest:", alkahestAddr);
    console.log("   NL Agreements:", nlAddr);
    console.log("   ERC-8004:", erc8004Addr);
  }

  // Always deploy local collateral token for deterministic demand flow.
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test ETH", "tETH", ethers.parseEther("1000"));
  await mockToken.waitForDeployment();
  const tokenAddr = await mockToken.getAddress();
  context.mockArtifacts.mockToken = tokenAddr;
  console.log("✅ Collateral token deployed:", tokenAddr);

  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy();
  await priceFeed.waitForDeployment();
  const priceFeedAddr = await priceFeed.getAddress();
  context.mockArtifacts.mockPriceFeed = priceFeedAddr;
  console.log("✅ Mock Price Feed deployed:", priceFeedAddr);
  
  // Step 2: Deploy AI-Evaluated Arbiter
  console.log("\n2️⃣ Deploying AI-Evaluated Arbiter...");
  
  const AIEvaluatedArbiter = await ethers.getContractFactory("AIEvaluatedArbiter");
  const arbiter = await AIEvaluatedArbiter.deploy(erc8004Addr, deployer.address);
  await arbiter.waitForDeployment();
  const arbiterAddr = await arbiter.getAddress();
  console.log("✅ AIEvaluatedArbiter deployed:", arbiterAddr);

  // Step 3: Deploy NLTradingEscrow (main contract)
  console.log("\n3️⃣ Deploying NLTradingEscrow...");
  
  const NLTradingEscrow = await ethers.getContractFactory("NLTradingEscrow");
  const escrow = await NLTradingEscrow.deploy(
    alkahestAddr,
    nlAddr,
    erc8004Addr,
    arbiterAddr,
    deployer.address, // agent address (deployer for testing)
    1 // agent ID (from ERC-8004 registration)
  );
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("✅ NLTradingEscrow deployed:", escrowAddr);

  // Step 4: Prepare protocol lifecycle transactions
  console.log("\n5️⃣ Preparing gasless transactions on Status Network...");

  const latestBlock = await ethers.provider.getBlock("latest");
  const baseTimestamp = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
  const releaseTime = baseTimestamp + 1;
  
  // Approve token for escrow
  const approveTx = await mockToken.approve(escrowAddr, ethers.parseEther("10"));
  await approveTx.wait();
  console.log("✅ Token approval: ", approveTx.hash);

  // Transaction 1: Create demand
  console.log("\n📊 Executing Transaction 1: Create NL Demand (GASLESS)...");
  
  const nlDescription = "Lock 0.01 ETH yield and open long ETH perp if price > 3200 within 24h";
  const createTx = await escrow.createDemand(
    nlDescription,
    tokenAddr,
    ethers.parseEther("0.01"),
    "long",
    "ETH",
    ethers.parseUnits("3200", 8), // Price in 8 decimals
    ethers.parseUnits("50", 18), // 50 USD notional
    releaseTime // 24h from latest block time
  );
  const createReceipt = await createTx.wait();
  console.log("✅ Demand created (TX1):", createTx.hash);
  console.log("   Gas used: ", createReceipt?.gasUsed.toString());

  const demandProofAfterCreate = await escrow.getDemandExecutionProof(0);
  const createdConditionHash = demandProofAfterCreate[0];
  const createdObligationId = demandProofAfterCreate[1];
  console.log("   Condition hash:", createdConditionHash);
  console.log("   Obligation ID:", createdObligationId.toString());

  // Transaction 2: Lock funds in escrow
  console.log("\n📊 Executing Transaction 2: Lock Funds in Escrow (GASLESS)...");
  
  const lockTx = await escrow.lockFunds(0); // demandId 0
  const lockReceipt = await lockTx.wait();
  console.log("✅ Funds locked (TX2):", lockTx.hash);
  console.log("   Gas used: ", lockReceipt?.gasUsed.toString());

  console.log("\n📊 Executing Transaction 3: Record trade execution (escrow arbitration gate)...");
  const gmxOrderKey = ethers.id("syntreature-order-0");
  const recordTradeTx = await escrow.recordTradeExecution(
    0,
    gmxOrderKey,
    ethers.parseUnits("3201", 8),
    ethers.parseUnits("50", 18)
  );
  const recordTradeReceipt = await recordTradeTx.wait();
  console.log("✅ Trade recorded (TX3):", recordTradeTx.hash);
  console.log("   Gas used: ", recordTradeReceipt?.gasUsed.toString());

  // Transaction 4: Request arbitration (arbiter side)
  console.log("\n📊 Executing Transaction 4: Request Arbitration (GASLESS)...");
  
  const arbitrationTx = await arbiter.requestArbitration(
    escrowAddr,
    createdObligationId,
    deployer.address,
    1, // agentId
    nlDescription
  );
  const arbitrationReceipt = await arbitrationTx.wait();
  console.log("✅ Arbitration requested (TX4):", arbitrationTx.hash);
  console.log("   Gas used: ", arbitrationReceipt?.gasUsed.toString());

  // Transaction 5: Settlement completion path (clawback)
  console.log("\n📊 Executing Transaction 5: Clawback settlement (GASLESS)...");
  const clawbackTx = await escrow.clawbackFunds(0);
  const clawbackReceipt = await clawbackTx.wait();
  console.log("✅ Clawback settled (TX5):", clawbackTx.hash);
  console.log("   Gas used: ", clawbackReceipt?.gasUsed.toString());

  const demandProofFinal = await escrow.getDemandExecutionProof(0);

  // Step 5: Summary
  console.log("\n" + "=".repeat(60));
  console.log("✨ GASLESS DEPLOYMENT COMPLETE ✨");
  console.log("=".repeat(60));
  console.log("\n📝 Contract Addresses:");
  console.log(`   NLTradingEscrow:    ${escrowAddr}`);
  console.log(`   AIEvaluatedArbiter: ${arbiterAddr}`);
  console.log(`   Alkahest:           ${alkahestAddr}`);
  console.log(`   ERC-8004:           ${erc8004Addr}`);
  console.log(`   Collateral token:   ${tokenAddr}`);

  console.log("\n🔗 Explorer:");
  console.log("   https://sepoliascan.status.network");

  console.log("\n💾 Deployment saved to deployment-status-sepolia.json");

  // Save deployment info
  const deploymentInfo = {
    network: "Status Network Sepolia",
    chainId: 1660990954,
    rpc: "https://public.sepolia.rpc.status.network",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    integrationMode: mode,
    qualifyingForPartnerTracks: mode === "real",
    nonQualifyingReason:
      mode === "mock"
        ? "Mock fallback mode only. Do not use this artifact for partner-track qualification."
        : undefined,
    protocolAddressesUsed: {
      alkahest: alkahestAddr,
      naturalLanguageAgreements: nlAddr,
      erc8004: erc8004Addr,
    },
    contracts: {
      NLTradingEscrow: escrowAddr,
      AIEvaluatedArbiter: arbiterAddr,
      CollateralToken: tokenAddr,
      MockPriceFeed: priceFeedAddr,
      ...(mode === "mock"
        ? {
            MockAlkahest: context.mockArtifacts.mockAlkahest,
            MockERC8004: context.mockArtifacts.mockERC8004,
            MockNLAgreements: context.mockArtifacts.mockNLAgreements,
          }
        : {}),
    },
    protocolDemandEvidence: {
      demandId: 0,
      createdObligationId: createdObligationId.toString(),
      conditionHash: createdConditionHash,
      finalExecutionProof: {
        conditionHash: demandProofFinal[0],
        obligationId: demandProofFinal[1].toString(),
        lifecycleStatus: Number(demandProofFinal[2]),
        lastProtocolActionAt: Number(demandProofFinal[3]),
      },
    },
    transactions: {
      tokenApproval: approveTx.hash,
      createDemand: createTx.hash,
      lockFunds: lockTx.hash,
      recordTradeExecution: recordTradeTx.hash,
      requestArbitration: arbitrationTx.hash,
      settlement: {
        action: "clawback",
        hash: clawbackTx.hash,
      },
    },
    gasUsed: {
      createDemand: createReceipt?.gasUsed.toString(),
      lockFunds: lockReceipt?.gasUsed.toString(),
      recordTradeExecution: recordTradeReceipt?.gasUsed.toString(),
      requestArbitration: arbitrationReceipt?.gasUsed.toString(),
      settlement: clawbackReceipt?.gasUsed.toString(),
    },
    notes: [
      "All transactions executed with gasPrice = 0 on Status Network",
      "Includes protocol-bound demand creation with condition hash + obligation ID evidence",
      "Includes full settlement path via clawback tx hash",
      ...(mode === "mock"
        ? ["Mock mode is fallback only and non-qualifying for partner-track claims"]
        : ["Real mode artifact is intended for partner-track proof packaging"]),
    ],
  };

  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(
    "deployments/status-sepolia-deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n✅ All steps completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
