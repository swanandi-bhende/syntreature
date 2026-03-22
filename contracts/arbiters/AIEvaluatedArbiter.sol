// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC8004} from "../interfaces/IAlkahest.sol";

interface ITrustedEscrowExecution {
    function releaseFundsByArbiter(uint256 caseOrDemandId) external;

    function clawbackByArbiter(uint256 caseOrDemandId) external;
}

/**
 * @title AIEvaluatedArbiter
 * @dev New Alkahest arbiter primitive that evaluates conditions using AI oracle
 * Extends Alkahest's arbiter interface with:
 * - ERC-8004 identity verification (agent reputation)
 * - Weighted arbitration (higher credit score = faster payout)
 * - Natural-language condition evaluation
 *
 * This replaces manual arbitration with AI-evaluated conditions:
 * Instead of "did price cross X?", use "did price cross X AND trade PnL > Y?"
 *
 * Reference: https://github.com/arkhai-io/alkahest (IArbitrable interface)
 */
contract AIEvaluatedArbiter is Ownable {
    enum CaseLifecycle {
        Requested,
        Evaluated,
        ExecutedRelease,
        ExecutedClawback,
        Cancelled
    }

    // Structs
    struct ArbitrationCase {
        uint256 caseId;
        address escrowAddress;
        uint256 demandOrObligationId;
        uint256 obligationId;
        address agent;
        uint256 agentId;
        address evaluator;
        string nlCondition;
        bytes evaluationProof; // Off-chain AI evaluation result
        CaseLifecycle lifecycle;
        bool resolved;
        bool executed;
        bool shouldRelease;
        uint256 requestedAt;
        uint256 evaluatedAt;
        uint256 executedAt;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    struct AgentReputation {
        uint256 agentId;
        address agent;
        uint256 creditScore; // 0-1000
        uint256 successfulArbitrations;
        uint256 failedArbitrations;
        uint256 lastUpdated;
    }

    // State
    address public erc8004Address;
    address public oracleAddress;

    uint256 public caseCounter;
    uint256 public minimumCreditScore = 100; // Agents need min score to arbitrate

    mapping(uint256 => ArbitrationCase) private cases;
    mapping(address => AgentReputation) public agentReputation;
    mapping(address => uint256[]) public agentCases;
    mapping(address => bool) public trustedEscrow;

    // Events
    event ArbitrationRequested(
        uint256 indexed caseId,
        address indexed agent,
        uint256 agentId,
        string nlCondition
    );
    event ConditionEvaluated(uint256 indexed caseId, bool shouldRelease, bytes proof);
    event ArbitrationResolved(uint256 indexed caseId, address indexed agent, uint256 payoutAmount);
    event ArbitrationExecuted(uint256 indexed caseId, bool shouldRelease, uint256 executedAt);
    event ArbitrationCancelled(uint256 indexed caseId, address indexed cancelledBy, uint256 cancelledAt);
    event TrustedEscrowSet(address indexed escrow, bool isTrusted);
    event ArbitrationTerminalAction(
        uint256 indexed caseId,
        address indexed escrowAddress,
        bytes32 action,
        address indexed caller,
        bytes32 proofHash,
        uint256 reputationWeightUsed
    );
    event ReputationUpdated(address indexed agent, uint256 creditScore);

    // Modifiers
    modifier onlyValidAgent(uint256 agentId) {
        IERC8004 erc8004 = IERC8004(erc8004Address);
        require(erc8004.ownerOf(agentId) != address(0), "Invalid agent ID");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracleAddress, "Only oracle can call");
        _;
    }

    /**
     * @dev Initialize arbiter with protocol addresses
     */
    constructor(address _erc8004, address _oracle) Ownable(msg.sender) {
        erc8004Address = _erc8004;
        oracleAddress = _oracle;
    }

    /**
     * @dev Request arbitration for a trade condition
     * AI oracle will evaluate the NL condition off-chain
     *
     * @param escrow NLTradingEscrow contract address
     * @param obligationId Alkahest obligation ID
     * @param agent ERC-8004 agent address
     * @param agentId ERC-8004 agent ID (NFT ID)
     * @param nlCondition Plain-English condition (e.g., "Price crossed 3200 AND trade PnL > 0")
     */
    function requestArbitration(
        address escrow,
        uint256 obligationId,
        address agent,
        uint256 agentId,
        string memory nlCondition
    ) external onlyValidAgent(agentId) returns (uint256) {
        require(escrow != address(0), "Invalid escrow");
        require(agent != address(0), "Invalid agent");
        require(trustedEscrow[escrow], "Escrow not trusted");

        uint256 caseId = caseCounter++;

        ArbitrationCase storage arbitrationCase = cases[caseId];
        arbitrationCase.caseId = caseId;
        arbitrationCase.escrowAddress = escrow;
        arbitrationCase.demandOrObligationId = obligationId;
        arbitrationCase.obligationId = obligationId;
        arbitrationCase.agent = agent;
        arbitrationCase.agentId = agentId;
        arbitrationCase.evaluator = address(0);
        arbitrationCase.nlCondition = nlCondition;
        arbitrationCase.lifecycle = CaseLifecycle.Requested;
        arbitrationCase.executed = false;
        arbitrationCase.requestedAt = block.timestamp;
        arbitrationCase.evaluatedAt = 0;
        arbitrationCase.executedAt = 0;
        arbitrationCase.createdAt = block.timestamp;
        arbitrationCase.resolvedAt = 0;
        arbitrationCase.resolved = false;

        agentCases[agent].push(caseId);

        emit ArbitrationRequested(caseId, agent, agentId, nlCondition);

        return caseId;
    }

    /**
     * @dev Oracle submits evaluation of the condition
     * This would be called by an off-chain AI oracle that:
     * 1. Fetches on-chain data (prices, trade state)
     * 2. Parses the NL condition
     * 3. Evaluates the condition
     * 4. Submits proof (could be hash of evaluation, signature, etc.)
     *
     * @param caseId Arbitration case ID
     * @param shouldRelease Whether the condition was met
     * @param proof Off-chain proof/signature from oracle
     */
    function evaluateCondition(
        uint256 caseId,
        bool shouldRelease,
        bytes calldata proof
    ) external onlyOracle {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        require(!arbitrationCase.resolved, "Already resolved");
        require(arbitrationCase.escrowAddress != address(0), "Invalid case");
        require(arbitrationCase.lifecycle == CaseLifecycle.Requested, "Invalid lifecycle");

        arbitrationCase.shouldRelease = shouldRelease;
        arbitrationCase.evaluationProof = proof;
        arbitrationCase.evaluator = msg.sender;
        arbitrationCase.lifecycle = CaseLifecycle.Evaluated;
        arbitrationCase.evaluatedAt = block.timestamp;
        arbitrationCase.resolved = true;
        arbitrationCase.resolvedAt = block.timestamp;

        // Update agent reputation based on oracle evaluation
        _updateReputation(arbitrationCase.agent, arbitrationCase.agentId, shouldRelease);

        emit ConditionEvaluated(caseId, shouldRelease, proof);
    }

    /**
     * @dev Execute arbitration decision (release or clawback)
     * Called by escrow or oracle to finalize the arbitration
     */
    function executeArbitration(uint256 caseId) external {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        require(arbitrationCase.resolved, "Not evaluated yet");
        require(!arbitrationCase.executed, "Already executed");
        require(arbitrationCase.lifecycle == CaseLifecycle.Evaluated, "Invalid lifecycle");
        require(msg.sender == arbitrationCase.escrowAddress || msg.sender == oracleAddress, "Not authorized");
        require(trustedEscrow[arbitrationCase.escrowAddress], "Escrow not trusted");

        bytes32 proofHash = keccak256(arbitrationCase.evaluationProof);
        uint256 reputationWeightUsed = agentReputation[arbitrationCase.agent].creditScore;

        ITrustedEscrowExecution escrow = ITrustedEscrowExecution(arbitrationCase.escrowAddress);

        if (arbitrationCase.shouldRelease) {
            escrow.releaseFundsByArbiter(arbitrationCase.demandOrObligationId);
            arbitrationCase.lifecycle = CaseLifecycle.ExecutedRelease;
            emit ArbitrationTerminalAction(
                caseId,
                arbitrationCase.escrowAddress,
                keccak256("release"),
                msg.sender,
                proofHash,
                reputationWeightUsed
            );
        } else {
            escrow.clawbackByArbiter(arbitrationCase.demandOrObligationId);
            arbitrationCase.lifecycle = CaseLifecycle.ExecutedClawback;
            emit ArbitrationTerminalAction(
                caseId,
                arbitrationCase.escrowAddress,
                keccak256("clawback"),
                msg.sender,
                proofHash,
                reputationWeightUsed
            );
        }

        arbitrationCase.executed = true;
        arbitrationCase.executedAt = block.timestamp;

        emit ArbitrationExecuted(caseId, arbitrationCase.shouldRelease, arbitrationCase.executedAt);

        emit ArbitrationResolved(caseId, arbitrationCase.agent, 0);
    }

    /**
     * @dev Cancel a non-terminal arbitration case.
     */
    function cancelArbitration(uint256 caseId) external onlyOwner {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        require(arbitrationCase.escrowAddress != address(0), "Invalid case");
        require(!arbitrationCase.executed, "Already executed");
        require(arbitrationCase.lifecycle != CaseLifecycle.Cancelled, "Already cancelled");

        arbitrationCase.lifecycle = CaseLifecycle.Cancelled;
        emit ArbitrationCancelled(caseId, msg.sender, block.timestamp);
    }

    /**
     * @dev Update agent reputation based on arbitration outcome
     * Higher credit score agents get weighted preference in future arbitrations
     */
    function _updateReputation(address agent, uint256 agentId, bool success) internal {
        AgentReputation storage rep = agentReputation[agent];

        if (rep.agentId == 0) {
            rep.agentId = agentId;
            rep.agent = agent;
            rep.creditScore = 500; // Start at 500/1000
        }

        if (success) {
            rep.successfulArbitrations++;
            rep.creditScore = min(rep.creditScore + 50, 1000);
        } else {
            rep.failedArbitrations++;
            rep.creditScore = max(rep.creditScore - 50, 0);
        }

        rep.lastUpdated = block.timestamp;

        // Sync with ERC-8004 registry
        _syncToERC8004(agentId, rep.creditScore);

        emit ReputationUpdated(agent, rep.creditScore);
    }

    /**
     * @dev Sync reputation score to ERC-8004 credit score registry
     */
    function _syncToERC8004(uint256 agentId, uint256 creditScore) internal {
        IERC8004 erc8004 = IERC8004(erc8004Address);
        erc8004.updateCreditScore(agentId, creditScore);
    }

    /**
     * @dev Get arbitration case details
     */
    function getCase(uint256 caseId) external view returns (ArbitrationCase memory) {
        return cases[caseId];
    }

    /**
     * @dev Get agent's arbitration history
     */
    function getAgentCases(address agent) external view returns (uint256[] memory) {
        return agentCases[agent];
    }

    /**
     * @dev Get agent's reputation
     */
    function getReputation(address agent) external view returns (AgentReputation memory) {
        return agentReputation[agent];
    }

    /**
     * @dev Check if agent's credit score meets minimum threshold
     */
    function isAgentQualified(address agent) external view returns (bool) {
        return agentReputation[agent].creditScore >= minimumCreditScore;
    }

    /**
     * @dev Set minimum credit score for arbitration eligibility
     */
    function setMinimumCreditScore(uint256 _score) external onlyOwner {
        minimumCreditScore = _score;
    }

    /**
     * @dev Update oracle address
     */
    function setOracleAddress(address _oracle) external onlyOwner {
        oracleAddress = _oracle;
    }

    function setTrustedEscrow(address escrow, bool isTrusted) external onlyOwner {
        require(escrow != address(0), "Invalid escrow");
        trustedEscrow[escrow] = isTrusted;
        emit TrustedEscrowSet(escrow, isTrusted);
    }

    // Utility functions
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
}
