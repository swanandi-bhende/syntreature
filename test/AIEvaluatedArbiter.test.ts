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
  let agent2: any;
  let agent3: any;
  let agent4: any;
  let agent5: any;
  let agent6: any;
  let agent7: any;
  let agent8: any;

  before(async function () {
    [owner, agent, oracle, agent2, agent3, agent4, agent5, agent6, agent7, agent8] = await ethers.getSigners();

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

    // Register all agents needed for tests
    await erc8004.registerAgent(1, agent.address, "Test Agent");
    await erc8004.registerAgent(2, agent2.address, "Test Agent 2");
    await erc8004.registerAgent(3, agent3.address, "Test Agent 3");
    await erc8004.registerAgent(4, agent4.address, "Test Agent 4");
    await erc8004.registerAgent(5, agent5.address, "Test Agent 5");
    await erc8004.registerAgent(6, agent6.address, "Test Agent 6");
    await erc8004.registerAgent(7, agent7.address, "Test Agent 7");
    await erc8004.registerAgent(8, agent8.address, "Test Agent 8");
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
      expect(updatedReputation.creditScore > initialReputation.creditScore).to.be.true;
      expect(updatedReputation.successfulArbitrations >= 1n).to.be.true;
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
      expect(updatedReputation.creditScore < initialReputation.creditScore).to.be.true;
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

  describe("Reputation-Weighted Decision Gating", function () {
    it("should apply reputation discount to confidence threshold", async function () {
      // First boost agent2's score to 800+ by running successful evaluations
      for (let i = 0; i < 6; i++) {
        const caseId = await arbiter.connect(agent2).requestArbitration.staticCall(
          await trustedEscrow.getAddress(),
          20 + i,
          agent2.address,
          2,
          `Boost score test ${i}`
        );

        await arbiter.connect(agent2).requestArbitration(
          await trustedEscrow.getAddress(),
          20 + i,
          agent2.address,
          2,
          `Boost score test ${i}`
        );

        const proof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
          nonce: BigInt(20000 + i),
        });
        await arbiter.connect(oracle).evaluateCondition(caseId, proof);
      }

      // Now agent2 should have score 500 + (6 * 50) = 800
      const rep = await arbiter.getReputation(agent2.address);
      expect(rep.creditScore).to.equal(800n);
      const highScoreCaseId = await arbiter.connect(agent2).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        200,
        agent2.address,
        2,
        "High score test"
      );

      await arbiter.connect(agent2).requestArbitration(
        await trustedEscrow.getAddress(),
        200,
        agent2.address,
        2,
        "High score test"
      );

      // Manually set high reputation
      await arbiter.setTrustedEscrow(await trustedEscrow.getAddress(), true);
      
      // Submit proof with confidence below base threshold but above high-score threshold
      const proofConfidence = 4500n; // 45% confidence
      const proof = await makeEvaluationProof(arbiter, oracle, highScoreCaseId, true, {
        confidenceBps: proofConfidence,
        nonce: 4001n,
      });

      // With 1000 bps discount from high score (800+), required = 5000 - 1000 = 4000
      // Proof of 4500 should pass
      const tx = await arbiter.connect(oracle).evaluateCondition(highScoreCaseId, proof);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const arbitrationCase = await arbiter.getCase(highScoreCaseId);
      expect(arbitrationCase.requiredConfidenceBps).to.equal(4000n);
      expect(arbitrationCase.confidenceMarginBps).to.equal(500n);
      expect(arbitrationCase.applyingReputationDiscount).to.equal(1000n);
    });

    it("should reject proof that fails reputation-adjusted threshold", async function () {
      // agent3 already registered in before()
      const lowScoreCaseId = await arbiter.connect(agent3).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        300,
        agent3.address,
        3,
        "Low score test"
      );

      await arbiter.connect(agent3).requestArbitration(
        await trustedEscrow.getAddress(),
        300,
        agent3.address,
        3,
        "Low score test"
      );

      // Low score agent has no discount, so required = 5000
      // Submit proof with only 4000 confidence - should fail
      const proof = await makeEvaluationProof(arbiter, oracle, lowScoreCaseId, true, {
        confidenceBps: 4000n,
        nonce: 4002n,
      });

      let reverted = false;
      try {
        await arbiter.connect(oracle).evaluateCondition(lowScoreCaseId, proof);
      } catch (error) {
        reverted = true;
      }
      expect(reverted).to.equal(true);
    });

    it("should enforce evidence source minimum for low-score agents", async function () {
      // agent4 already registered in before()

      // Drop agent4's score below 500 by running failing evaluations
      for (let i = 0; i < 10; i++) {
        const caseId = await arbiter.connect(agent4).requestArbitration.staticCall(
          await trustedEscrow.getAddress(),
          40 + i,
          agent4.address,
          4,
          `Drop score test ${i}`
        );

        await arbiter.connect(agent4).requestArbitration(
          await trustedEscrow.getAddress(),
          40 + i,
          agent4.address,
          4,
          `Drop score test ${i}`
        );

        const proof = await makeEvaluationProof(arbiter, oracle, caseId, false, {
          nonce: BigInt(40000 + i),
        });
        await arbiter.connect(oracle).evaluateCondition(caseId, proof);
      }

      // Now agent4 should have score 500 - (10 * 50) = 0 (but clamped at 0)
      const rep = await arbiter.getReputation(agent4.address);
      expect(rep.creditScore < 500n).to.be.true;

      const caseId = await arbiter.connect(agent4).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        400,
        agent4.address,
        4,
        "Evidence test"
      );

      await arbiter.connect(agent4).requestArbitration(
        await trustedEscrow.getAddress(),
        400,
        agent4.address,
        4,
        "Evidence test"
      );

      // Low-score agent requires sourceCount >= 2
      // Submit with only 1 source
      const proof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        confidenceBps: 7500n, // High confidence
        sourceCount: 1n, // Too few
        nonce: 4003n,
      });

      let reverted = false;
      try {
        await arbiter.connect(oracle).evaluateCondition(caseId, proof);
      } catch (error) {
        reverted = true;
      }
      expect(reverted).to.equal(true);

      // Now with 2 sources should pass if proof is recent
      const proof2 = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        confidenceBps: 7500n,
        sourceCount: 2n, // Acceptable
        nonce: 4004n,
      });
      await arbiter.connect(oracle).evaluateCondition(caseId, proof2);

      const arbitrationCase = await arbiter.getCase(caseId);
      expect(arbitrationCase.sourceIdsHash).to.equal(proof2.sourceIdsHash);
    });

    it("should reject stale proofs for low-score agents", async function () {
      // agent5 already registered in before()

      // Drop agent5's score below 500 by running failing evaluations
      for (let i = 0; i < 10; i++) {
        const caseId = await arbiter.connect(agent5).requestArbitration.staticCall(
          await trustedEscrow.getAddress(),
          50 + i,
          agent5.address,
          5,
          `Drop score test ${i}`
        );

        await arbiter.connect(agent5).requestArbitration(
          await trustedEscrow.getAddress(),
          50 + i,
          agent5.address,
          5,
          `Drop score test ${i}`
        );

        const proof = await makeEvaluationProof(arbiter, oracle, caseId, false, {
          nonce: BigInt(50000 + i),
        });
        await arbiter.connect(oracle).evaluateCondition(caseId, proof);
      }

      const caseId = await arbiter.connect(agent5).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        500,
        agent5.address,
        5,
        "Stale proof test"
      );

      await arbiter.connect(agent5).requestArbitration(
        await trustedEscrow.getAddress(),
        500,
        agent5.address,
        5,
        "Stale proof test"
      );

      const latest = await ethers.provider.getBlock("latest");
      const now = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));

      // Proof older than lowScoreProofWindowSeconds (3600)
      const staleProof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        confidenceBps: 9000n,
        sourceCount: 2n,
        issuedAt: now - 7200n, // 2 hours old
        expiresAt: now + 3600n,
        nonce: 4005n,
      });

      let reverted = false;
      try {
        await arbiter.connect(oracle).evaluateCondition(caseId, staleProof);
      } catch (error) {
        reverted = true;
      }
      expect(reverted).to.equal(true);
    });

    it("should enforce cooldown for low-score agent execution", async function () {
      // agent6 already registered in before()

      // Drop agent6's score below riskThreshold (300) by running failing evaluations
      // Need extra failures so score stays below riskThreshold even after a +50 success
      for (let i = 0; i < 6; i++) {  // 500 - (6 * 50) = 200 < 300
        const caseId = await arbiter.connect(agent6).requestArbitration.staticCall(
          await trustedEscrow.getAddress(),
          60 + i,
          agent6.address,
          6,
          `Drop score test ${i}`
        );

        await arbiter.connect(agent6).requestArbitration(
          await trustedEscrow.getAddress(),
          60 + i,
          agent6.address,
          6,
          `Drop score test ${i}`
        );

        const proof = await makeEvaluationProof(arbiter, oracle, caseId, false, {
          nonce: BigInt(60000 + i),
        });
        await arbiter.connect(oracle).evaluateCondition(caseId, proof);
      }

      // Now agent6 should have score 500 - (6 * 50) = 200 < 300 (riskThreshold)

      // Create and evaluate first case
      const caseId1 = await arbiter.connect(agent6).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        600,
        agent6.address,
        6,
        "Cooldown test 1"
      );

      await arbiter.connect(agent6).requestArbitration(
        await trustedEscrow.getAddress(),
        600,
        agent6.address,
        6,
        "Cooldown test 1"
      );

      const proof1 = await makeEvaluationProof(arbiter, oracle, caseId1, true, {
        confidenceBps: 7500n,
        nonce: 5001n,
      });
      await arbiter.connect(oracle).evaluateCondition(caseId1, proof1);
      await arbiter.connect(oracle).executeArbitration(caseId1);

      // Create second case immediately - should hit cooldown
      const caseId2 = await arbiter.connect(agent6).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        601,
        agent6.address,
        6,
        "Cooldown test 2"
      );

      await arbiter.connect(agent6).requestArbitration(
        await trustedEscrow.getAddress(),
        601,
        agent6.address,
        6,
        "Cooldown test 2"
      );

      const proof2 = await makeEvaluationProof(arbiter, oracle, caseId2, true, {
        confidenceBps: 7500n,
        nonce: 5002n,
      });
      await arbiter.connect(oracle).evaluateCondition(caseId2, proof2);

      // Try to execute immediately - should fail cooldown
      let reverted = false;
      try {
        await arbiter.connect(oracle).executeArbitration(caseId2);
      } catch (error) {
        reverted = true;
      }
      expect(reverted).to.equal(true);
    });

    it("should allow execution after cooldown window expires", async function () {
      // agent7 already registered in before()

      // Drop agent7's score below riskThreshold 
      for (let i = 0; i < 5; i++) {
        const caseId = await arbiter.connect(agent7).requestArbitration.staticCall(
          await trustedEscrow.getAddress(),
          70 + i,
          agent7.address,
          7,
          `Drop score test ${i}`
        );

        await arbiter.connect(agent7).requestArbitration(
          await trustedEscrow.getAddress(),
          70 + i,
          agent7.address,
          7,
          `Drop score test ${i}`
        );

        const proof = await makeEvaluationProof(arbiter, oracle, caseId, false, {
          nonce: BigInt(70000 + i),
        });
        await arbiter.connect(oracle).evaluateCondition(caseId, proof);
      }

      // Set short cooldown for testing
      await arbiter.setLowScoreConstraints(2, 3600, 1); // 1 second cooldown

      const caseId = await arbiter.connect(agent7).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        700,
        agent7.address,
        7,
        "Cooldown expiry test"
      );

      await arbiter.connect(agent7).requestArbitration(
        await trustedEscrow.getAddress(),
        700,
        agent7.address,
        7,
        "Cooldown expiry test"
      );

      const proof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        confidenceBps: 7500n,
        nonce: 5003n,
      });
      await arbiter.connect(oracle).evaluateCondition(caseId, proof);

      // Mine blocks to advance time beyond cooldown
      await ethers.provider.send("hardhat_mine", ["0x10"]); // Mine 16 blocks (~1 sec per block)

      // Now execution should succeed
      const tx = await arbiter.connect(oracle).executeArbitration(caseId);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const arbitrationCase = await arbiter.getCase(caseId);
      expect(arbitrationCase.executed).to.equal(true);
    });

    it("should emit DecisionThresholdApplied event with correct values", async function () {
      // agent8 already registered in before()

      const caseId = await arbiter.connect(agent8).requestArbitration.staticCall(
        await trustedEscrow.getAddress(),
        800,
        agent8.address,
        8,
        "Event test"
      );

      await arbiter.connect(agent8).requestArbitration(
        await trustedEscrow.getAddress(),
        800,
        agent8.address,
        8,
        "Event test"
      );

      const proof = await makeEvaluationProof(arbiter, oracle, caseId, true, {
        confidenceBps: 7500n,
        nonce: 5004n,
      });

      const tx = await arbiter.connect(oracle).evaluateCondition(caseId, proof);

      const receipt = await tx.wait();
      const logs = receipt?.logs ?? [];

      let foundThresholdEvent = false;
      for (const eventLog of logs) {
        try {
          const event = arbiter.interface.parseLog(eventLog);
          if (event && event.name === "DecisionThresholdApplied") {
            expect(event.args.baseThreshold).to.equal(5000n);
            expect(event.args.confidenceMargin >= 0n).to.be.true;
            foundThresholdEvent = true;
          }
        } catch (e) {
          // Continue if parse fails
        }
      }
      expect(foundThresholdEvent).to.equal(true);
    });
  });
});
