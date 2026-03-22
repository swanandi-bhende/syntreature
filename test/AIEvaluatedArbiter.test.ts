import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre as any;

async function makeEvaluationProof(
  arbiter: any,
  oracle: any,
  caseId: bigint,
  shouldRelease: boolean,
  overrides?: Partial<{
    confidenceBps: bigint;
    model: string;
    modelVersion: string;
    sourceIdsHash: string;
    sourceCount: bigint;
    evidenceHash: string;
    issuedAt: bigint;
    expiresAt: bigint;
    nonce: bigint;
  }>
) {
  const latest = await ethers.provider.getBlock("latest");
  const now = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));

  const value = {
    caseId,
    shouldRelease,
    confidenceBps: overrides?.confidenceBps ?? 7500n,
    model: overrides?.model ?? "gpt-5.3-codex",
    modelVersion: overrides?.modelVersion ?? "2026-03-22",
    sourceIdsHash: overrides?.sourceIdsHash ?? ethers.id("source-ids"),
    sourceCount: overrides?.sourceCount ?? 2n,
    evidenceHash: overrides?.evidenceHash ?? ethers.id("evidence-root"),
    issuedAt: overrides?.issuedAt ?? now,
    expiresAt: overrides?.expiresAt ?? now + 3600n,
    nonce: overrides?.nonce ?? now,
  };

  const domain = {
    name: "AIEvaluatedArbiter",
    version: "1",
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    verifyingContract: await arbiter.getAddress(),
  };

  const types = {
    EvaluationProof: [
      { name: "caseId", type: "uint256" },
      { name: "shouldRelease", type: "bool" },
      { name: "confidenceBps", type: "uint256" },
      { name: "model", type: "string" },
      { name: "modelVersion", type: "string" },
      { name: "sourceIdsHash", type: "bytes32" },
      { name: "sourceCount", type: "uint256" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "issuedAt", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  };

  const signature = await oracle.signTypedData(domain, types, value);
  return { ...value, signature };
}

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
      const proof = await makeEvaluationProof(arbiter, oracle, 0n, true);
      const tx = await arbiter
        .connect(oracle)
        .evaluateCondition(0, proof);

      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const arbitrationCase = await arbiter.getCase(0);
      expect(arbitrationCase.evaluationHash).to.not.equal(ethers.ZeroHash);
      expect(arbitrationCase.sourceIdsHash).to.equal(proof.sourceIdsHash);
      expect(arbitrationCase.confidenceBps).to.equal(proof.confidenceBps);
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

      const proof = await makeEvaluationProof(arbiter, oracle, 1n, true, {
        nonce: 1001n,
      });
      await arbiter
        .connect(oracle)
        .evaluateCondition(1, proof);

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

      const proof = await makeEvaluationProof(arbiter, oracle, 2n, false, {
        nonce: 1002n,
      });
      await arbiter
        .connect(oracle)
        .evaluateCondition(2, proof);

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

      const proof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        nonce: 2001n,
      });
      await arbiter
        .connect(oracle)
        .evaluateCondition(caseId, proof);

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

      const proof = await makeEvaluationProof(arbiter, oracle, caseId, false, {
        nonce: 2002n,
      });
      await arbiter
        .connect(oracle)
        .evaluateCondition(caseId, proof);

      await arbiter.connect(oracle).executeArbitration(caseId);

      const arbitrationCase = await arbiter.getCase(caseId);
      expect(arbitrationCase.executed).to.equal(true);
      expect(arbitrationCase.lifecycle).to.equal(3n); // ExecutedClawback
      expect(await trustedEscrow.clawbackCalled()).to.equal(true);
      expect(await trustedEscrow.lastCaseOrDemandId()).to.equal(12n);
    });

    it("should reject expired, replayed, and invalid-signature proofs", async function () {
      const caseId = await arbiter.connect(agent).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        99,
        agent.address,
        1,
        "Proof constraints"
      );

      await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        99,
        agent.address,
        1,
        "Proof constraints"
      );

      const latest = await ethers.provider.getBlock("latest");
      const now = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));

      const expiredProof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        issuedAt: now - 100n,
        expiresAt: now - 1n,
        nonce: 3001n,
      });

      let expiredReverted = false;
      try {
        await arbiter.connect(oracle).evaluateCondition(caseId, expiredProof);
      } catch {
        expiredReverted = true;
      }
      expect(expiredReverted).to.equal(true);

      const validProof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        nonce: 3002n,
      });
      await arbiter.connect(oracle).evaluateCondition(caseId, validProof);

      let replayReverted = false;
      try {
        await arbiter.connect(oracle).evaluateCondition(caseId, validProof);
      } catch {
        replayReverted = true;
      }
      expect(replayReverted).to.equal(true);

      const caseId2 = await arbiter.connect(agent).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        100,
        agent.address,
        1,
        "Invalid signature"
      );

      await arbiter.connect(agent).requestArbitration(
        await trustedEscrow.getAddress(),
        100,
        agent.address,
        1,
        "Invalid signature"
      );

      const invalidSigProof = await makeEvaluationProof(arbiter, agent, caseId2, true, {
        nonce: 3003n,
      });

      let signatureReverted = false;
      try {
        await arbiter.connect(oracle).evaluateCondition(caseId2, invalidSigProof);
      } catch {
        signatureReverted = true;
      }
      expect(signatureReverted).to.equal(true);
    });
  });
});
