import hre from "hardhat";

const { ethers } = hre;

/**
 * Deploy script for Status Network Sepolia Testnet
 * Demonstrates gasless deployment + 3+ gasless transactions
 * 
 * Network: Status Network Sepolia
 * Chain ID: 1660990954
 * RPC: https://public.sepolia.rpc.status.network
 * Gas: 0 (gasless at protocol level)
 */

async function main() {
  console.log("🚀 Deploying Syntreature to Status Network Sepolia (Gasless)...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer:", deployer.address);

  // Step 1: Deploy mock contracts for testing
  console.log("\n1️⃣ Deploying mock contracts...");
  
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test ETH", "tETH", ethers.parseEther("1000"));
  await mockToken.waitForDeployment();
  const tokenAddr = await mockToken.getAddress();
  console.log("✅ Mock ERC20 deployed:", tokenAddr);

  const MockAlkahest = await ethers.getContractFactory("MockAlkahest");
  const alkahest = await MockAlkahest.deploy();
  await alkahest.waitForDeployment();
  const alkahestAddr = await alkahest.getAddress();
  console.log("✅ Mock Alkahest deployed:", alkahestAddr);

  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy();
  await priceFeed.waitForDeployment();
  const priceFeedAddr = await priceFeed.getAddress();
  console.log("✅ Mock Price Feed deployed:", priceFeedAddr);

  const Mocks = await ethers.getContractFactory("MockNaturalLanguageAgreements");
  const nlAgreements = await Mocks.deploy();
  await nlAgreements.waitForDeployment();
  const nlAddr = await nlAgreements.getAddress();
  console.log("✅ Mock NL Agreements deployed:", nlAddr);

  const MockERC8004 = await ethers.getContractFactory("MockERC8004");
  const erc8004 = await MockERC8004.deploy();
  await erc8004.waitForDeployment();
  const erc8004Addr = await erc8004.getAddress();
  console.log("✅ Mock ERC-8004 deployed:", erc8004Addr);

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

  // Step 4: Register mock agent on ERC-8004
  console.log("\n4️⃣ Registering agent on ERC-8004...");
  
  const registerTx = await erc8004.registerAgent(
    1,
    deployer.address,
    JSON.stringify({
      name: "Syntreature Agent",
      harness: "Copilot",
      model: "gpt-5.3-codex",
      system: "Autonomous NL trading agent"
    })
  );
  await registerTx.wait();
  console.log("✅ Agent registered on ERC-8004");

  // Step 5: Prepare for gasless transactions
  console.log("\n5️⃣ Preparing gasless transactions on Status Network...");
  
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
    Math.floor(Date.now() / 1000) + 86400 // 24h from now
  );
  const createReceipt = await createTx.wait();
  console.log("✅ Demand created (TX1):", createTx.hash);
  console.log("   Gas used: ", createReceipt?.gasUsed.toString());

  // Transaction 2: Lock funds in escrow
  console.log("\n📊 Executing Transaction 2: Lock Funds in Escrow (GASLESS)...");
  
  const lockTx = await escrow.lockFunds(0); // demandId 0
  const lockReceipt = await lockTx.wait();
  console.log("✅ Funds locked (TX2):", lockTx.hash);
  console.log("   Gas used: ", lockReceipt?.gasUsed.toString());

  // Transaction 3: Request arbitration
  console.log("\n📊 Executing Transaction 3: Request Arbitration (GASLESS)...");
  
  const arbitrationTx = await arbiter.requestArbitration(
    escrowAddr,
    0, // obligationId
    deployer.address,
    1, // agentId
    nlDescription
  );
  const arbitrationReceipt = await arbitrationTx.wait();
  console.log("✅ Arbitration requested (TX3):", arbitrationTx.hash);
  console.log("   Gas used: ", arbitrationReceipt?.gasUsed.toString());

  // Step 6: Summary
  console.log("\n" + "=".repeat(60));
  console.log("✨ GASLESS DEPLOYMENT COMPLETE ✨");
  console.log("=".repeat(60));
  console.log("\n📝 Contract Addresses:");
  console.log(`   NLTradingEscrow:    ${escrowAddr}`);
  console.log(`   AIEvaluatedArbiter: ${arbiterAddr}`);
  console.log(`   MockAlkahest:       ${alkahestAddr}`);
  console.log(`   MockERC8004:        ${erc8004Addr}`);
  console.log(`   MockERC20:          ${tokenAddr}`);

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
    contracts: {
      NLTradingEscrow: escrowAddr,
      AIEvaluatedArbiter: arbiterAddr,
      MockAlkahest: alkahestAddr,
      MockERC8004: erc8004Addr,
      MockERC20: tokenAddr,
      MockPriceFeed: priceFeedAddr,
      MockNLAgreements: nlAddr,
    },
    transactions: {
      tokenApproval: approveTx.hash,
      createDemand: createTx.hash,
      lockFunds: lockTx.hash,
      requestArbitration: arbitrationTx.hash,
    },
    gasUsed: {
      createDemand: createReceipt?.gasUsed.toString(),
      lockFunds: lockReceipt?.gasUsed.toString(),
      requestArbitration: arbitrationReceipt?.gasUsed.toString(),
    },
    notes: [
      "All transactions executed with gasPrice = 0 on Status Network",
      "Demonstrates 3+ gasless transactions as required for Status track",
      "Ready for GMX integration on Arbitrum for trading execution",
    ]
  };

  const fs = require("fs");
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
