import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre as any;

describe("GMXPositionManager Phase 3 Acceptance", function () {
  let owner: any;
  let manager: any;
  let priceFeed: any;
  let collateral: any;
  let registry: any;
  let updater: any;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    priceFeed = await MockPriceFeed.deploy();
    await priceFeed.waitForDeployment();

    const GMXPositionManager = await ethers.getContractFactory("GMXPositionManager");
    manager = await GMXPositionManager.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await priceFeed.getAddress()
    );
    await manager.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateral = await MockERC20.deploy("USD Coin", "USDC", 1000);
    await collateral.waitForDeployment();

    const MockERC8004 = await ethers.getContractFactory("MockERC8004");
    registry = await MockERC8004.deploy();
    await registry.waitForDeployment();
    await registry.registerAgent(1, owner.address, "Acceptance agent");

    const CreditScoreUpdater = await ethers.getContractFactory("CreditScoreUpdater");
    updater = await CreditScoreUpdater.deploy(
      await registry.getAddress(),
      await manager.getAddress()
    );
    await updater.waitForDeployment();

    await manager.setCreditRegistry(await updater.getAddress(), 1);
    await manager.setExecutionMode("wrapper");
  });

  it("emits rich open/close lifecycle events and linkage events", async function () {
    const market = owner.address;
    const collateralToken = await collateral.getAddress();
    const collateralAmount = ethers.parseUnits("50", 6);
    const sizeDeltaUsd = ethers.parseUnits("250", 18);

    const openTx = await manager.openPosition(
      market,
      collateralToken,
      collateralAmount,
      sizeDeltaUsd,
      true
    );
    const openReceipt = await openTx.wait();

    let positionKey = ethers.ZeroHash;
    let sawOpenRequested = false;
    let sawOpened = false;

    for (const eventLog of openReceipt?.logs ?? []) {
      try {
        const event = manager.interface.parseLog(eventLog);
        if (event?.name === "PositionOpenRequested") {
          sawOpenRequested = true;
          positionKey = event.args.positionKey;
          expect(event.args.market).to.equal(market);
          expect(event.args.caller).to.equal(owner.address);
          expect(event.args.collateralToken).to.equal(collateralToken);
          expect(event.args.collateralAmount).to.equal(collateralAmount);
          expect(event.args.sizeDeltaUsd).to.equal(sizeDeltaUsd);
          expect(event.args.isLong).to.equal(true);
        }
        if (event?.name === "PositionOpened") {
          sawOpened = true;
          expect(event.args.market).to.equal(market);
          expect(event.args.caller).to.equal(owner.address);
          expect(event.args.collateralToken).to.equal(collateralToken);
          expect(event.args.collateralAmount).to.equal(collateralAmount);
          expect(event.args.sizeDeltaUsd).to.equal(sizeDeltaUsd);
          expect(event.args.isLong).to.equal(true);
        }
      } catch {
        // ignore unrelated logs
      }
    }

    expect(sawOpenRequested).to.equal(true);
    expect(sawOpened).to.equal(true);
    expect(positionKey).to.not.equal(ethers.ZeroHash);

    // Make trade profitable so deterministic score delta policy applies +25
    await priceFeed.setPrice(3500n * 10n ** 8n);

    const closeTx = await manager.closePosition(positionKey);
    const closeReceipt = await closeTx.wait();

    let sawCloseRequested = false;
    let sawClosed = false;
    let sawFinalized = false;
    let sawCreditRequest = false;

    for (const eventLog of closeReceipt?.logs ?? []) {
      try {
        const event = manager.interface.parseLog(eventLog);
        if (event?.name === "PositionCloseRequested") {
          sawCloseRequested = true;
          expect(event.args.positionKey).to.equal(positionKey);
          expect(event.args.market).to.equal(market);
          expect(event.args.caller).to.equal(owner.address);
          expect(event.args.collateralToken).to.equal(collateralToken);
          expect(event.args.sizeDeltaUsd).to.equal(sizeDeltaUsd);
          expect(event.args.isLong).to.equal(true);
        }
        if (event?.name === "PositionClosed") {
          sawClosed = true;
          expect(event.args.positionKey).to.equal(positionKey);
          expect(event.args.market).to.equal(market);
          expect(event.args.caller).to.equal(owner.address);
          expect(event.args.collateralToken).to.equal(collateralToken);
          expect(event.args.sizeDeltaUsd).to.equal(sizeDeltaUsd);
          expect(event.args.isLong).to.equal(true);
          expect(event.args.pnl > 0n).to.equal(true);
        }
        if (event?.name === "TradeResultFinalized") {
          sawFinalized = true;
          expect(event.args.positionKey).to.equal(positionKey);
          expect(event.args.pnl > 0n).to.equal(true);
          expect(event.args.wasProfitable).to.equal(true);
        }
        if (event?.name === "CreditUpdateRequested") {
          sawCreditRequest = true;
          expect(event.args.agentId).to.equal(1n);
          expect(event.args.positionKey).to.equal(positionKey);
          expect(event.args.recommendedDelta).to.equal(25n);
        }
      } catch {
        // ignore unrelated logs
      }
    }

    expect(sawCloseRequested).to.equal(true);
    expect(sawClosed).to.equal(true);
    expect(sawFinalized).to.equal(true);
    expect(sawCreditRequest).to.equal(true);
  });

  it("traces close tx to score update tx via shared position key", async function () {
    const openTx = await manager.openPosition(
      owner.address,
      await collateral.getAddress(),
      ethers.parseUnits("50", 6),
      ethers.parseUnits("250", 18),
      true
    );
    const openReceipt = await openTx.wait();

    let positionKey = ethers.ZeroHash;
    for (const eventLog of openReceipt?.logs ?? []) {
      try {
        const event = manager.interface.parseLog(eventLog);
        if (event?.name === "PositionOpened") {
          positionKey = event.args.positionKey;
        }
      } catch {
        // ignore unrelated logs
      }
    }

    await priceFeed.setPrice(3500n * 10n ** 8n);
    const closeTx = await manager.closePosition(positionKey);
    await closeTx.wait();

    const scoreTx = await updater.applyQueuedUpdate(positionKey, 300);
    const scoreReceipt = await scoreTx.wait();

    let sawUpdated = false;
    for (const eventLog of scoreReceipt?.logs ?? []) {
      try {
        const event = updater.interface.parseLog(eventLog);
        if (event?.name === "CreditScoreUpdated") {
          sawUpdated = true;
          expect(event.args.positionKey).to.equal(positionKey);
          expect(event.args.scoreBefore).to.equal(300n);
          expect(event.args.scoreAfter).to.equal(325n);
          expect(event.args.appliedDelta).to.equal(25n);
        }
      } catch {
        // ignore unrelated logs
      }
    }

    expect(sawUpdated).to.equal(true);
    expect(await registry.getCreditScore(1)).to.equal(325n);
  });
});
