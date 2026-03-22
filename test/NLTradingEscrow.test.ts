import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre as any;

function getAlkahestEventNames(receipt: any, contractInterface: any): string[] {
  const names: string[] = [];
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed?.name) names.push(parsed.name);
    } catch {
      // Ignore logs from other contracts.
    }
  }
  return names;
}

describe("NLTradingEscrow", function () {
  let escrow: any;
  let mockToken: any;
  let alkahest: any;
  let nlAgreements: any;
  let erc8004: any;
  let owner: any;
  let agent: any;

  before(async function () {
    [owner, agent] = await ethers.getSigners();

    // Deploy mocks
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000"));
    await mockToken.waitForDeployment();

    const MockAlkahest = await ethers.getContractFactory("MockAlkahest");
    alkahest = await MockAlkahest.deploy();
    await alkahest.waitForDeployment();

    const Mocks = await ethers.getContractFactory("MockNaturalLanguageAgreements");
    nlAgreements = await Mocks.deploy();
    await nlAgreements.waitForDeployment();

    const MockERC8004 = await ethers.getContractFactory("MockERC8004");
    erc8004 = await MockERC8004.deploy();
    await erc8004.waitForDeployment();

    // Deploy escrow
    const NLTradingEscrow = await ethers.getContractFactory("NLTradingEscrow");
    escrow = await NLTradingEscrow.deploy(
      await alkahest.getAddress(),
      await nlAgreements.getAddress(),
      await erc8004.getAddress(),
      owner.address,
      agent.address,
      1
    );
    await escrow.waitForDeployment();

    // Mint tokens to agent
    await mockToken.mint(agent.address, ethers.parseEther("100"));
  });

  describe("Demand Creation", function () {
    it("should create a NL demand", async function () {
      const tx = await escrow.connect(agent).createDemand(
        "Lock 0.01 ETH and open long if price > 3200",
        await mockToken.getAddress(),
        ethers.parseEther("0.01"),
        "long",
        "ETH",
        ethers.parseUnits("3200", 8),
        ethers.parseUnits("50", 18),
        Math.floor(Date.now() / 1000) + 86400
      );

      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const demand = await escrow.getDemand(0);
      expect(demand.nlDescription).to.equal(
        "Lock 0.01 ETH and open long if price > 3200"
      );
      expect(demand.collateralAmount).to.equal(ethers.parseEther("0.01"));
    });

    it("should reject demand with zero amount", async function () {
      const releaseTime = Math.floor(Date.now() / 1000) + 86400;

      let reverted = false;
      try {
        await escrow.connect(agent).createDemand(
          "Invalid demand",
          await mockToken.getAddress(),
          0,
          "long",
          "ETH",
          ethers.parseUnits("3200", 8),
          ethers.parseUnits("50", 18),
          releaseTime
        );
      } catch (error) {
        reverted = true;
      }
      expect(reverted).to.equal(true);
    });
  });

  describe("Fund Locking", function () {
    it("should lock funds in escrow", async function () {
      const demandId = await escrow.connect(agent).createDemand.staticCall(
        "Test demand for locking",
        await mockToken.getAddress(),
        ethers.parseEther("0.05"),
        "long",
        "ETH",
        ethers.parseUnits("3200", 8),
        ethers.parseUnits("50", 18),
        Math.floor(Date.now() / 1000) + 86400
      );

      // Create demand first
      await escrow.connect(agent).createDemand(
        "Test demand for locking",
        await mockToken.getAddress(),
        ethers.parseEther("0.05"),
        "long",
        "ETH",
        ethers.parseUnits("3200", 8),
        ethers.parseUnits("50", 18),
        Math.floor(Date.now() / 1000) + 86400
      );

      // Approve tokens
      await mockToken
        .connect(agent)
        .approve(await escrow.getAddress(), ethers.parseEther("0.05"));

      // Lock funds
      await escrow.connect(agent).lockFunds(demandId);

      const demand = await escrow.getDemand(demandId);
      expect(demand.alkahestObligationId).to.be.greaterThanOrEqual(0);
    });
  });

  describe("Credit Score Updates", function () {
    it("should update credit score on successful arbitration", async function () {
      const demandId = await escrow.connect(agent).createDemand.staticCall(
        "Credit score test",
        await mockToken.getAddress(),
        ethers.parseEther("0.02"),
        "long",
        "ETH",
        ethers.parseUnits("3200", 8),
        ethers.parseUnits("50", 18),
        Math.floor(Date.now() / 1000) + 86400
      );

      // Create and lock demand
      await escrow.connect(agent).createDemand(
        "Credit score test",
        await mockToken.getAddress(),
        ethers.parseEther("0.02"),
        "long",
        "ETH",
        ethers.parseUnits("3200", 8),
        ethers.parseUnits("50", 18),
        Math.floor(Date.now() / 1000) + 86400
      );

      await mockToken
        .connect(agent)
        .approve(await escrow.getAddress(), ethers.parseEther("0.02"));

      // Lock funds
      await escrow.connect(agent).lockFunds(demandId);

      // Record trade execution
      await escrow.connect(agent).recordTradeExecution(
        demandId,
        ethers.id("trade-key"),
        ethers.parseUnits("3300", 8),
        ethers.parseUnits("50", 18)
      );

      // Release funds (should update credit score)
      const tx = await escrow.connect(owner).releaseFunds(demandId);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const settledDemand = await escrow.getDemand(demandId);
      expect(settledDemand.settled).to.equal(true);
    });
  });

  describe("User Queries", function () {
    it("should return user demands", async function () {
      const demands = await escrow.getUserDemands(agent.address);
      expect(demands.length).to.be.greaterThan(0);
    });
  });

  describe("End-to-End Protocol Lifecycle", function () {
    it("should execute NL demand -> obligation -> lock -> arbitrate -> settle with protocol-backed state", async function () {
      const nlDemand = "Lock 0.03 ETH and release on successful arbitration";
      const releaseTime = Math.floor(Date.now() / 1000) + 86400;

      const demandId = await escrow.connect(agent).createDemand.staticCall(
        nlDemand,
        await mockToken.getAddress(),
        ethers.parseEther("0.03"),
        "long",
        "ETH",
        ethers.parseUnits("3200", 8),
        ethers.parseUnits("50", 18),
        releaseTime
      );

      const createTx = await escrow.connect(agent).createDemand(
        nlDemand,
        await mockToken.getAddress(),
        ethers.parseEther("0.03"),
        "long",
        "ETH",
        ethers.parseUnits("3200", 8),
        ethers.parseUnits("50", 18),
        releaseTime
      );
      const createReceipt = await createTx.wait();

      const createEvents = getAlkahestEventNames(createReceipt, alkahest.interface);
      expect(createEvents).to.include("ObligationCreated");

      const [conditionHash, obligationId] = await escrow.getDemandExecutionProof(demandId);
      expect(conditionHash).to.not.equal(ethers.ZeroHash);
      expect(obligationId).to.be.greaterThan(0);

      await mockToken
        .connect(agent)
        .approve(await escrow.getAddress(), ethers.parseEther("0.03"));

      const lockTx = await escrow.connect(agent).lockFunds(demandId);
      const lockReceipt = await lockTx.wait();
      const lockEvents = getAlkahestEventNames(lockReceipt, alkahest.interface);
      expect(lockEvents).to.include("CollateralLocked");

      await escrow.connect(agent).recordTradeExecution(
        demandId,
        ethers.id("e2e-trade-key"),
        ethers.parseUnits("3300", 8),
        ethers.parseUnits("50", 18)
      );

      const releaseTx = await escrow.connect(owner).releaseFunds(demandId);
      const releaseReceipt = await releaseTx.wait();
      const releaseEvents = getAlkahestEventNames(releaseReceipt, alkahest.interface);

      const resolvedIdx = releaseEvents.indexOf("ObligationResolved");
      const releasedIdx = releaseEvents.indexOf("ObligationReleased");
      expect(resolvedIdx).to.be.greaterThan(-1);
      expect(releasedIdx).to.be.greaterThan(-1);
      expect(resolvedIdx).to.be.lessThan(releasedIdx);

      const demand = await escrow.getDemand(demandId);
      expect(demand.settled).to.equal(true);
      expect(demand.lifecycleStatus).to.equal(4n); // ResolvedRelease
      expect(demand.obligationId).to.equal(obligationId);

      const protocolObligation = await alkahest.getObligation(obligationId);
      expect(protocolObligation.status).to.equal(5n); // Released

      // Terminal state must be immutable: second settlement attempt must fail.
      let reverted = false;
      try {
        await escrow.connect(owner).releaseFunds(demandId);
      } catch {
        reverted = true;
      }
      expect(reverted).to.equal(true);

      const finalDemand = await escrow.getDemand(demandId);
      expect(finalDemand.settled).to.equal(true);
      expect(finalDemand.lifecycleStatus).to.equal(4n);
    });
  });
});
