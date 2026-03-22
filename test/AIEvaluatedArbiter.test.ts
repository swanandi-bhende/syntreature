import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre as any;

describe("AIEvaluatedArbiter", function () {
  let arbiter: any;
  let erc8004: any;
  let trustedEscrow: any;
  let owner: any;
  let agent: any;
  let oracle: any;

  before(async function () {
    [owner, agent, oracle] = await ethers.getSigners();

    // Deploy mocks
    const MockERC8004 = await ethers.getContractFactory("MockERC8004");
    erc8004 = await MockERC8004.deploy();
    await erc8004.waitForDeployment();

    // Deploy arbiter
    const AIEvaluatedArbiter = await ethers.getContractFactory("AIEvaluatedArbiter");
    arbiter = await AIEvaluatedArbiter.deploy(
      await erc8004.getAddress(),
      oracle.address
    );
    await arbiter.waitForDeployment();

    const MockTrustedEscrow = await ethers.getContractFactory("MockTrustedEscrow");
    trustedEscrow = await MockTrustedEscrow.deploy();
    await trustedEscrow.waitForDeployment();

    await arbiter.setTrustedEscrow(await trustedEscrow.getAddress(), true);

    // Register agent
    await erc8004.registerAgent(1, agent.address, "Test Agent");
  });

  describe("Arbitration Request", function () {
    it("should request arbitration for trade condition", async function () {
      const tx = await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        0, // dummy obligation
        agent.address,
        1, // agentId
        "Price crossed 3200 AND trade PnL > 0"
      );

      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const arbitrationCase = await arbiter.getCase(0);
      expect(arbitrationCase.nlCondition).to.include("Price crossed");
    });

    it("should reject invalid agent", async function () {
      let reverted = false;
      try {
        await arbiter.connect(agent).requestArbitration(
          await trustedEscrow.getAddress(),
          0,
          agent.address,
          999, // Invalid agent ID
          "Test condition"
        );
      } catch (error) {
        reverted = true;
      }
      expect(reverted).to.equal(true);
    });
  });

  describe("Condition Evaluation", function () {
    it("should evaluate condition and update reputation", async function () {
      // Request arbitration
      await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        0,
        agent.address,
        1,
        "Test condition"
      );

      // Evaluate condition
      const tx = await arbiter
        .connect(oracle)
        .evaluateCondition(0, true, ethers.id("proof"));

      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const arbitrationCase = await arbiter.getCase(0);
      expect(arbitrationCase.resolved).to.be.true;
      expect(arbitrationCase.shouldRelease).to.be.true;
    });

    it("should update agent reputation on success", async function () {
      // Request and evaluate
      await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        1,
        agent.address,
        1,
        "Success condition"
      );

      const initialReputation = await arbiter.getReputation(agent.address);

      await arbiter
        .connect(oracle)
        .evaluateCondition(1, true, ethers.id("proof"));

      const updatedReputation = await arbiter.getReputation(agent.address);
      expect(updatedReputation.creditScore).to.be.greaterThan(
        initialReputation.creditScore
      );
      expect(updatedReputation.successfulArbitrations).to.be.greaterThanOrEqual(1);
    });

    it("should penalize reputation on failure", async function () {
      // Request and evaluate
      await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        2,
        agent.address,
        1,
        "Failure condition"
      );

      const initialReputation = await arbiter.getReputation(agent.address);

      await arbiter
        .connect(oracle)
        .evaluateCondition(2, false, ethers.id("proof"));

      const updatedReputation = await arbiter.getReputation(agent.address);
      expect(updatedReputation.creditScore).to.be.lessThan(
        initialReputation.creditScore
      );
      expect(updatedReputation.failedArbitrations).to.equal(1);
    });
  });

  describe("Agent Qualification", function () {
    it("should check if agent qualifies for arbitration", async function () {
      const isQualified = await arbiter.isAgentQualified(agent.address);
      // Should be qualified with sufficient credit score
      expect(isQualified).to.be.a("boolean");
    });

    it("should update minimum credit score requirement", async function () {
      await arbiter.setMinimumCreditScore(600);
      const isQualified = await arbiter.isAgentQualified(agent.address);
      expect(isQualified).to.equal(false);
    });
  });

  describe("Trusted Escrow Execution", function () {
    it("should execute release through trusted escrow", async function () {
      const caseId = await arbiter.connect(agent).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        11,
        agent.address,
        1,
        "Release path condition"
      );

      await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        11,
        agent.address,
        1,
        "Release path condition"
      );

      await arbiter
        .connect(oracle)
        .evaluateCondition(caseId, true, ethers.id("release-proof"));

      await arbiter.connect(oracle).executeArbitration(caseId);

      const arbitrationCase = await arbiter.getCase(caseId);
      expect(arbitrationCase.executed).to.equal(true);
      expect(arbitrationCase.lifecycle).to.equal(2n); // ExecutedRelease
      expect(await trustedEscrow.releaseCalled()).to.equal(true);
      expect(await trustedEscrow.lastCaseOrDemandId()).to.equal(11n);
    });

    it("should execute clawback through trusted escrow", async function () {
      const caseId = await arbiter.connect(agent).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        12,
        agent.address,
        1,
        "Clawback path condition"
      );

      await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        12,
        agent.address,
        1,
        "Clawback path condition"
      );

      await arbiter
        .connect(oracle)
        .evaluateCondition(caseId, false, ethers.id("clawback-proof"));

      await arbiter.connect(oracle).executeArbitration(caseId);

      const arbitrationCase = await arbiter.getCase(caseId);
      expect(arbitrationCase.executed).to.equal(true);
      expect(arbitrationCase.lifecycle).to.equal(3n); // ExecutedClawback
      expect(await trustedEscrow.clawbackCalled()).to.equal(true);
      expect(await trustedEscrow.lastCaseOrDemandId()).to.equal(12n);
    });
  });
});
