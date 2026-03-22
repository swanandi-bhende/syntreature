// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAlkahest, INaturalLanguageAgreements, IERC8004} from "../interfaces/IAlkahest.sol";

/**
 * @title NLTradingEscrow
 * @dev Escrow contract for natural-language trading demands
 * Integrates with Alkahest, natural-language-agreements, ERC-8004, and GMX
 *
 * Flows:
 * 1. Agent creates NL demand (e.g., "Lock 0.01 ETH yield, open long ETH on GMX if price > 3200")
 * 2. Contract converts to Alkahest Obligation + AI-evaluated arbiter
 * 3. Funds locked gaslessly on Status Network
 * 4. GMX trade executed on Arbitrum (via cross-chain message)
 * 5. Arbiter evaluates condition → releases funds
 * 6. Credit score updated on ERC-8004 registry
 */
contract NLTradingEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum DemandLifecycleStatus {
        Draft,
        ObligationCreated,
        CollateralLocked,
        ArbitrationRequested,
        ResolvedRelease,
        ResolvedClawback
    }

    // State variables
    address public alkahestAddress;
    address public nlAgreementsAddress;
    address public erc8004Address;
    address public arbiterAddress;
    address public agentAddress;
    uint256 public agentId;

    uint256 public obligationCounter;

    // Structs
    struct NLDemand {
        uint256 id;
        address requester;
        string nlDescription;
        bytes32 conditionHash;
        bytes32 parserMetadataHash;
        uint64 parsedConditionVersion;
        address collateralToken;
        uint256 collateralAmount;
        string tradeType; // "long" or "short"
        string asset; // e.g., "ETH"
        uint256 priceThreshold;
        uint256 sizeUsd;
        uint256 releaseTime;
        uint256 obligationId;
        DemandLifecycleStatus lifecycleStatus;
        uint256 lastProtocolActionAt;
        bool settled;
        // Kept for backward compatibility with existing scripts/tests.
        uint256 alkahestObligationId;
    }

    struct TradeExecution {
        uint256 demandId;
        bytes32 gmxOrderKey;
        bool completed;
        uint256 executedPrice;
        uint256 executedSize;
    }

    // Mappings
    mapping(uint256 => NLDemand) private demands;
    mapping(bytes32 => TradeExecution) public executions;
    mapping(address => uint256[]) public userDemands;

    // Events
    event DemandCreated(uint256 indexed demandId, address indexed requester, string nlDescription);
    event DemandSettled(uint256 indexed demandId, bool success);
    event TradeExecuted(uint256 indexed demandId, bytes32 gmxOrderKey, uint256 executedPrice);
    event CreditScoreUpdated(uint256 indexed agentId, uint256 newScore);

    // Modifiers
    modifier onlyAgent() {
        require(msg.sender == agentAddress, "Only agent can call this");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiterAddress, "Only arbiter can call this");
        _;
    }

    /**
     * @dev Initialize escrow with protocol addresses
     */
    constructor(
        address _alkahest,
        address _nlAgreements,
        address _erc8004,
        address _arbiter,
        address _agent,
        uint256 _agentId
    ) Ownable(msg.sender) {
        alkahestAddress = _alkahest;
        nlAgreementsAddress = _nlAgreements;
        erc8004Address = _erc8004;
        arbiterAddress = _arbiter;
        agentAddress = _agent;
        agentId = _agentId;
    }

    /**
     * @dev Agent creates a natural-language trading demand
     * @param nlDescription Plain English demand (parsed by natural-language-agreements)
     * @param collateralToken Token to lock as collateral
     * @param collateralAmount Amount of collateral
     * @param tradeType "long" or "short"
     * @param asset Asset to trade (e.g., "ETH")
     * @param priceThreshold Price at which trade executes
     * @param sizeUsd USD notional size for GMX trade
     * @param releaseTime Timestamp after which funds can be clawed back
     */
    function createDemand(
        string memory nlDescription,
        address collateralToken,
        uint256 collateralAmount,
        string memory tradeType,
        string memory asset,
        uint256 priceThreshold,
        uint256 sizeUsd,
        uint256 releaseTime
    ) external onlyAgent nonReentrant returns (uint256) {
        require(collateralAmount > 0, "Amount must be > 0");
        require(collateralToken != address(0), "Invalid collateral token");
        require(bytes(nlDescription).length > 0, "NL description required");
        require(releaseTime > block.timestamp, "Release time must be in future");

        uint256 demandId = obligationCounter++;
        (uint256 obligationId, bytes32 conditionHash) = _createProtocolObligation(
            demandId,
            msg.sender,
            nlDescription,
            collateralToken,
            collateralAmount,
            releaseTime
        );

        // Store demand
        NLDemand storage demand = demands[demandId];
        demand.id = demandId;
        demand.requester = msg.sender;
        demand.nlDescription = nlDescription;
        demand.conditionHash = conditionHash;
        demand.parserMetadataHash = keccak256(abi.encodePacked("nla-v1", nlDescription));
        demand.parsedConditionVersion = 1;
        demand.collateralToken = collateralToken;
        demand.collateralAmount = collateralAmount;
        demand.tradeType = _compareStrings(tradeType, "long") ? "long" : "short";
        demand.asset = asset;
        demand.priceThreshold = priceThreshold;
        demand.sizeUsd = sizeUsd;
        demand.releaseTime = releaseTime;
        demand.obligationId = obligationId;
        demand.lifecycleStatus = DemandLifecycleStatus.ObligationCreated;
        demand.lastProtocolActionAt = block.timestamp;
        demand.settled = false;
        demand.alkahestObligationId = obligationId;

        userDemands[msg.sender].push(demandId);

        emit DemandCreated(demandId, msg.sender, nlDescription);

        return demandId;
    }

    function _createProtocolObligation(
        uint256 demandId,
        address requester,
        string memory nlDescription,
        address collateralToken,
        uint256 collateralAmount,
        uint256 releaseTime
    )
        internal
        returns (uint256 obligationId, bytes32 conditionHash)
    {
        conditionHash = INaturalLanguageAgreements(nlAgreementsAddress).hashCondition(nlDescription);
        require(conditionHash != bytes32(0), "Invalid condition hash");

        obligationId = IAlkahest(alkahestAddress).createObligation(
            demandId,
            _buildObligationTerms(requester, collateralToken, collateralAmount, releaseTime),
            _buildCondition(conditionHash, nlDescription),
            _buildArbiterConfig()
        );
        require(obligationId > 0, "Invalid obligation ID");
    }

    function _buildObligationTerms(
        address requester,
        address collateralToken,
        uint256 collateralAmount,
        uint256 releaseTime
    ) internal view returns (IAlkahest.ObligationTerms memory) {
        return IAlkahest.ObligationTerms({
            requester: requester,
            beneficiary: requester,
            collateralToken: collateralToken,
            collateralAmount: collateralAmount,
            releaseTime: releaseTime,
            createdAt: block.timestamp
        });
    }

    function _buildCondition(
        bytes32 conditionHash,
        string memory nlDescription
    ) internal pure returns (IAlkahest.ConditionReference memory) {
        return IAlkahest.ConditionReference({
            conditionHash: conditionHash,
            conditionURI: "",
            parserMetadataHash: keccak256(abi.encodePacked("nla-v1", nlDescription)),
            parserVersion: 1
        });
    }

    function _buildArbiterConfig() internal view returns (IAlkahest.ArbiterConfig memory) {
        return IAlkahest.ArbiterConfig({
            arbiter: arbiterAddress,
            resolver: arbiterAddress,
            reputationWeighted: true,
            minReputationScore: 100,
            policyHash: keccak256(abi.encodePacked("ai-evaluated-arbiter-v1"))
        });
    }

    /**
     * @dev Lock funds in Alkahest escrow with AI-evaluated arbiter
     * @param demandId ID of the demand
     */
    function lockFunds(uint256 demandId) external onlyAgent nonReentrant {
        NLDemand storage demand = demands[demandId];
        require(!demand.settled, "Demand already settled");
        require(demand.collateralAmount > 0, "No collateral to lock");
        require(demand.conditionHash != bytes32(0), "Condition hash not set");
        require(demand.obligationId > 0, "No obligation created");
        require(
            demand.lifecycleStatus == DemandLifecycleStatus.ObligationCreated,
            "Demand not ready for lock"
        );

        // Transfer collateral from agent to this contract
        IERC20(demand.collateralToken).safeTransferFrom(agentAddress, address(this), demand.collateralAmount);

        // Approve Alkahest to take funds
        IERC20(demand.collateralToken).forceApprove(alkahestAddress, demand.collateralAmount);

        // Lock collateral against pre-created obligation.
        IAlkahest(alkahestAddress).lockCollateral(
            demand.obligationId,
            demand.collateralToken,
            demand.collateralAmount
        );

        demand.lifecycleStatus = DemandLifecycleStatus.CollateralLocked;
        demand.lastProtocolActionAt = block.timestamp;
    }

    /**
     * @dev Record GMX trade execution
     * Called by off-chain agent after GMX order confirmed
     */
    function recordTradeExecution(
        uint256 demandId,
        bytes32 gmxOrderKey,
        uint256 executedPrice,
        uint256 executedSize
    ) external onlyAgent {
        NLDemand storage demand = demands[demandId];
        require(!demand.settled, "Demand already settled");
        require(
            demand.lifecycleStatus == DemandLifecycleStatus.CollateralLocked,
            "Demand not ready for arbitration"
        );

        TradeExecution storage execution = executions[gmxOrderKey];
        execution.demandId = demandId;
        execution.gmxOrderKey = gmxOrderKey;
        execution.executedPrice = executedPrice;
        execution.executedSize = executedSize;
        execution.completed = true;

        demand.lifecycleStatus = DemandLifecycleStatus.ArbitrationRequested;
        demand.lastProtocolActionAt = block.timestamp;

        emit TradeExecuted(demandId, gmxOrderKey, executedPrice);
    }

    /**
     * @dev Arbiter releases escrowed funds on successful trade execution
     */
    function releaseFunds(uint256 demandId) external onlyArbiter nonReentrant {
        NLDemand storage demand = demands[demandId];
        require(!demand.settled, "Already settled");
        require(demand.obligationId > 0, "No obligation created");
        require(
            demand.lifecycleStatus == DemandLifecycleStatus.ArbitrationRequested,
            "Arbitration not requested"
        );

        bytes32 resolutionHash = keccak256(
            abi.encodePacked("release", demandId, demand.conditionHash, block.number)
        );

        IAlkahest alkahest = IAlkahest(alkahestAddress);
        alkahest.resolveObligation(demand.obligationId, true, resolutionHash);
        alkahest.releaseObligation(demand.obligationId);

        demand.lifecycleStatus = DemandLifecycleStatus.ResolvedRelease;
        demand.lastProtocolActionAt = block.timestamp;
        demand.settled = true;

        // Update agent's credit score on ERC-8004
        _updateCreditScore(agentId, 100);

        emit DemandSettled(demandId, true);
    }

    /**
     * @dev Agent claws back funds if condition not met by releaseTime
     */
    function clawbackFunds(uint256 demandId) external onlyAgent nonReentrant {
        NLDemand storage demand = demands[demandId];
        require(!demand.settled, "Already settled");
        require(block.timestamp >= demand.releaseTime, "Release time not reached");
        require(demand.obligationId > 0, "No obligation created");
        require(
            demand.lifecycleStatus == DemandLifecycleStatus.ArbitrationRequested,
            "Arbitration not requested"
        );

        bytes32 resolutionHash = keccak256(
            abi.encodePacked("clawback", demandId, demand.conditionHash, block.number)
        );

        // Clawback via Alkahest lifecycle
        IAlkahest alkahest = IAlkahest(alkahestAddress);
        alkahest.resolveObligation(demand.obligationId, false, resolutionHash);
        alkahest.clawbackObligation(demand.obligationId);

        demand.lifecycleStatus = DemandLifecycleStatus.ResolvedClawback;
        demand.lastProtocolActionAt = block.timestamp;
        demand.settled = true;

        // Penalize credit score
        _updateCreditScore(agentId, 50);

        emit DemandSettled(demandId, false);
    }

    /**
     * @dev Update agent's credit score on ERC-8004 registry
     */
    function _updateCreditScore(uint256 _agentId, uint256 points) internal {
        IERC8004 erc8004 = IERC8004(erc8004Address);
        // In production, fetch current score and add points
        erc8004.updateCreditScore(_agentId, points);
        emit CreditScoreUpdated(_agentId, points);
    }

    /**
     * @dev Get user's demands
     */
    function getUserDemands(address user) external view returns (uint256[] memory) {
        return userDemands[user];
    }

    /**
     * @dev Get demand details
     */
    function getDemand(uint256 demandId) external view returns (NLDemand memory) {
        return demands[demandId];
    }

    /**
     * @dev String comparison utility
     */
    function _compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }

    /**
     * @dev Emergency withdraw (only owner)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
