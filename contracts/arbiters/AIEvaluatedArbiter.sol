// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC8004} from "../interfaces/IAlkahest.sol";

interface ITrustedEscrowExecution {
    function releaseFundsByArbiter(uint256 caseOrDemandId) external;

    function clawbackByArbiter(uint256 caseOrDemandId) external;
}

// ============ Custom Errors (for audit clarity) ============
error AlreadyEvaluated();
error AlreadyExecuted();
error InvalidLifecycleTransition();
error ProofNotValid();
error NonceAlreadyUsed();
error EscrowNotTrusted();
error OracleSignatureInvalid();
error InvalidCase();
error ConfidenceBelowThreshold();
error InsufficientEvidence();
error ProofTooOld();
error NotAuthorized();
error InvalidEscrow();
error InvalidAgent();
error InvalidCaller();

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
    using ECDSA for bytes32;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant EVALUATION_PROOF_TYPEHASH =
        keccak256(
            "EvaluationProof(uint256 caseId,bool shouldRelease,uint256 confidenceBps,string model,string modelVersion,bytes32 sourceIdsHash,uint256 sourceCount,bytes32 evidenceHash,uint256 issuedAt,uint256 expiresAt,uint256 nonce)"
        );
    bytes32 private constant NAME_HASH = keccak256("AIEvaluatedArbiter");
    bytes32 private constant VERSION_HASH = keccak256("1");

    enum CaseLifecycle {
        Requested,
        Evaluated,
        ExecutedRelease,
        ExecutedClawback,
        Cancelled
    }

    // Cancel reason codes for emergency path
    enum CancelReason {
        NoReason,
        OwnerEmergency,
        InvalidProof,
        SecurityViolation,
        ProtocolViolation
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
        bytes32 evaluationHash;
        bytes32 sourceIdsHash;
        uint256 confidenceBps;
        bytes32 evidenceHash;
        string model;
        string modelVersion;
        uint256 proofNonce;
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
        // Reputation-weighted decision fields
        uint256 requiredConfidenceBps; // Threshold adjusted by agent reputation
        uint256 confidenceMarginBps; // Actual confidence minus required threshold
        uint256 agentScoreAtEvaluation; // Agent's credit score when evaluated
        uint256 applyingReputationDiscount; // Discount applied to threshold (bps)
        // Emergency cancellation fields
        bool isCancelled;
        CancelReason cancelReason;
        address cancelledBy;
        uint256 cancelledAt;
    }

    struct EvaluationProof {
        uint256 caseId;
        bool shouldRelease;
        uint256 confidenceBps;
        string model;
        string modelVersion;
        bytes32 sourceIdsHash;
        uint256 sourceCount;
        bytes32 evidenceHash;
        uint256 issuedAt;
        uint256 expiresAt;
        uint256 nonce;
        bytes signature;
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

    // Reputation-weighted decision parameters
    uint256 public baseConfidenceThresholdBps = 5000; // 50% base threshold
    uint256 public highScoreThreshold = 800; // Score 800+ gets max discount
    uint256 public highScoreDiscount = 1000; // 10% discount on threshold
    uint256 public midScoreThreshold = 500; // Score 500-799 gets mid discount
    uint256 public midScoreDiscount = 500; // 5% discount on threshold
    uint256 public lowScoreMinEvidenceSources = 2; // Low score: require 2+ sources
    uint256 public lowScoreProofWindowSeconds = 3600; // Low score: proof must be <1hr old
    uint256 public lowScoreCooldownSeconds = 86400; // Low score: 24hr cooldown between executions
    uint256 public riskThreshold = 300; // Score below 300: strict controls apply

    mapping(uint256 => ArbitrationCase) private cases;
    mapping(address => AgentReputation) public agentReputation;
    mapping(address => uint256[]) public agentCases;
    mapping(address => bool) public trustedEscrow;
    mapping(bytes32 => bool) public usedProofNonces;
    mapping(address => uint256) public lastExecutionTimes; // Track last execution time per agent for cooldown

    // Events
    event ArbitrationRequested(
        uint256 indexed caseId,
        address indexed agent,
        uint256 agentId,
        string nlCondition
    );
    event ConditionEvaluated(uint256 indexed caseId, bool shouldRelease, bytes proof);
    event EvaluationProofStored(
        uint256 indexed caseId,
        bytes32 evaluationHash,
        bytes32 sourceIdsHash,
        uint256 confidenceBps,
        address indexed evaluator
    );
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
    event DecisionThresholdApplied(
        uint256 indexed caseId,
        uint256 baseThreshold,
        uint256 reputationDiscount,
        uint256 requiredThreshold,
        uint256 confidenceMargin
    );
    event ExecutionCooldownEnforced(
        uint256 indexed caseId,
        address indexed agent,
        uint256 requiredWaitSeconds
    );

    // Events refactored for phase 5 clarity
    event CaseEvaluated(
        uint256 indexed caseId,
        uint256 evaluatedAt,
        bytes32 evaluationHash,
        uint256 requiredThreshold,
        uint256 confidenceMargin
    );
    
    event CaseExecuted(
        uint256 indexed caseId,
        bool shouldRelease,
        uint256 executedAt,
        bytes32 action
    );

    event CaseCancelled(
        uint256 indexed caseId,
        CancelReason reason,
        address cancelledBy,
        uint256 cancelledAt
    );

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
     * 4. Submits signed evidence payload
     *
     * Reputation-weighted gating:
     * - High-score agents: lower confidence threshold required
     * - Low-score agents: stricter evidence requirements (2+ sources, fresher proofs)
     *
     * @param caseId Arbitration case ID
     * @param proof Signed evaluation payload from oracle (includes verdict + provenance)
     */
    function evaluateCondition(uint256 caseId, EvaluationProof calldata proof) external onlyOracle {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        if (arbitrationCase.resolved) revert AlreadyEvaluated();
        if (arbitrationCase.escrowAddress == address(0)) revert InvalidCase();
        if (arbitrationCase.lifecycle != CaseLifecycle.Requested) revert InvalidLifecycleTransition();
        if (proof.caseId != caseId) revert ProofNotValid();
        if (proof.issuedAt > block.timestamp) revert ProofNotValid();
        if (proof.expiresAt < block.timestamp) revert ProofNotValid();
        if (proof.sourceCount == 0) revert InsufficientEvidence();
        if (proof.confidenceBps > 10_000) revert ProofNotValid();

        // Get agent's current reputation score
        uint256 agentScore;
        if (agentReputation[arbitrationCase.agent].agentId == 0) {
            // Agent not yet initialized; will be set during _updateReputation
            agentScore = 500; // Default starting score
        } else {
            agentScore = agentReputation[arbitrationCase.agent].creditScore;
        }

        // Calculate reputation-adjusted required confidence threshold
        uint256 discount = getReputationDiscount(agentScore);
        uint256 requiredThreshold = getRequiredConfidenceBps(agentScore);

        // Low-score agents require additional evidence constraints
        if (agentScore < midScoreThreshold) {
            if (proof.sourceCount < lowScoreMinEvidenceSources) revert InsufficientEvidence();
            uint256 proofAge = block.timestamp - proof.issuedAt;
            if (proofAge > lowScoreProofWindowSeconds) revert ProofTooOld();
        }

        // Check confidence meets reputation-adjusted threshold
        if (proof.confidenceBps < requiredThreshold) revert ConfidenceBelowThreshold();

        bytes32 nonceKey = keccak256(abi.encodePacked(caseId, proof.nonce));
        if (usedProofNonces[nonceKey]) revert NonceAlreadyUsed();

        bytes32 digest = hashEvaluationProof(proof);
        address signer = digest.recover(proof.signature);
        if (signer != oracleAddress) revert OracleSignatureInvalid();

        usedProofNonces[nonceKey] = true;

        // Calculate confidence margin
        uint256 confidenceMargin = proof.confidenceBps - requiredThreshold;

        arbitrationCase.shouldRelease = proof.shouldRelease;
        arbitrationCase.evaluationProof = proof.signature;
        arbitrationCase.evaluator = signer;
        arbitrationCase.evaluationHash = digest;
        arbitrationCase.sourceIdsHash = proof.sourceIdsHash;
        arbitrationCase.confidenceBps = proof.confidenceBps;
        arbitrationCase.evidenceHash = proof.evidenceHash;
        arbitrationCase.model = proof.model;
        arbitrationCase.modelVersion = proof.modelVersion;
        arbitrationCase.proofNonce = proof.nonce;
        arbitrationCase.lifecycle = CaseLifecycle.Evaluated;
        arbitrationCase.evaluatedAt = block.timestamp;
        arbitrationCase.resolved = true;
        arbitrationCase.resolvedAt = block.timestamp;
        // Store reputation-weighted decision info
        arbitrationCase.requiredConfidenceBps = requiredThreshold;
        arbitrationCase.confidenceMarginBps = confidenceMargin;
        arbitrationCase.agentScoreAtEvaluation = agentScore;
        arbitrationCase.applyingReputationDiscount = discount;

        // Update agent reputation based on oracle evaluation
        _updateReputation(arbitrationCase.agent, arbitrationCase.agentId, proof.shouldRelease);

        emit DecisionThresholdApplied(
            caseId,
            baseConfidenceThresholdBps,
            discount,
            requiredThreshold,
            confidenceMargin
        );
        emit CaseEvaluated(
            caseId,
            block.timestamp,
            digest,
            requiredThreshold,
            confidenceMargin
        );
        emit ConditionEvaluated(caseId, proof.shouldRelease, abi.encodePacked(digest));
        emit EvaluationProofStored(
            caseId,
            digest,
            proof.sourceIdsHash,
            proof.confidenceBps,
            signer
        );
    }

    /**
     * @dev Execute arbitration decision (release or clawback)
     * Performs escrow call and terminal transition.
     * Only callable after case has been evaluated.
     * Terminal action: cannot be called twice.
     */
    function executeArbitration(uint256 caseId) external {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        if (!arbitrationCase.resolved) revert InvalidLifecycleTransition();
        if (arbitrationCase.executed) revert AlreadyExecuted();
        if (arbitrationCase.lifecycle != CaseLifecycle.Evaluated) revert InvalidLifecycleTransition();
        if (msg.sender != arbitrationCase.escrowAddress && msg.sender != oracleAddress) revert NotAuthorized();
        if (!trustedEscrow[arbitrationCase.escrowAddress]) revert EscrowNotTrusted();

        // Enforce execution cooldown for low-score agents
        uint256 agentScore = arbitrationCase.agentScoreAtEvaluation;
        if (agentScore < riskThreshold) {
            uint256 timeSinceLastExecution = block.timestamp - lastExecutionTimes[arbitrationCase.agent];
            if (lastExecutionTimes[arbitrationCase.agent] > 0) {
                // Agent has executed before; check cooldown
                if (timeSinceLastExecution < lowScoreCooldownSeconds) revert InvalidLifecycleTransition();
            }
            emit ExecutionCooldownEnforced(
                caseId,
                arbitrationCase.agent,
                lowScoreCooldownSeconds - min(timeSinceLastExecution, lowScoreCooldownSeconds)
            );
        }

        bytes32 proofHash = arbitrationCase.evaluationHash;
        uint256 reputationWeightUsed = agentReputation[arbitrationCase.agent].creditScore;
        bytes32 action;

        ITrustedEscrowExecution escrow = ITrustedEscrowExecution(arbitrationCase.escrowAddress);

        if (arbitrationCase.shouldRelease) {
            escrow.releaseFundsByArbiter(arbitrationCase.demandOrObligationId);
            arbitrationCase.lifecycle = CaseLifecycle.ExecutedRelease;
            action = keccak256("release");
            emit ArbitrationTerminalAction(
                caseId,
                arbitrationCase.escrowAddress,
                action,
                msg.sender,
                proofHash,
                reputationWeightUsed
            );
        } else {
            escrow.clawbackByArbiter(arbitrationCase.demandOrObligationId);
            arbitrationCase.lifecycle = CaseLifecycle.ExecutedClawback;
            action = keccak256("clawback");
            emit ArbitrationTerminalAction(
                caseId,
                arbitrationCase.escrowAddress,
                action,
                msg.sender,
                proofHash,
                reputationWeightUsed
            );
        }

        arbitrationCase.executed = true;
        arbitrationCase.executedAt = block.timestamp;
        lastExecutionTimes[arbitrationCase.agent] = block.timestamp;

        emit CaseExecuted(caseId, arbitrationCase.shouldRelease, arbitrationCase.executedAt, action);
        emit ArbitrationExecuted(caseId, arbitrationCase.shouldRelease, arbitrationCase.executedAt);
        emit ArbitrationResolved(caseId, arbitrationCase.agent, 0);
    }

    /**
     * @dev Emergency cancellation of arbitration case
     * Can only cancel in pre-execution states (Requested or Evaluated)
     * Owner or oracle can initiate with specified reason
     *
     * @param caseId Case to cancel
     * @param reason Cancellation reason code for audit trail
     */
    function cancelArbitration(uint256 caseId, CancelReason reason) external {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        if (arbitrationCase.escrowAddress == address(0)) revert InvalidCase();
        if (arbitrationCase.executed) revert AlreadyExecuted();
        if (arbitrationCase.lifecycle == CaseLifecycle.Cancelled) revert InvalidLifecycleTransition();
        if (arbitrationCase.lifecycle == CaseLifecycle.ExecutedRelease || 
            arbitrationCase.lifecycle == CaseLifecycle.ExecutedClawback) revert InvalidLifecycleTransition();
        if (msg.sender != owner() && msg.sender != oracleAddress) revert NotAuthorized();

        arbitrationCase.isCancelled = true;
        arbitrationCase.cancelReason = reason;
        arbitrationCase.cancelledBy = msg.sender;
        arbitrationCase.cancelledAt = block.timestamp;
        arbitrationCase.lifecycle = CaseLifecycle.Cancelled;
        
        emit CaseCancelled(caseId, reason, msg.sender, block.timestamp);
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
     * @dev Get case summary for audit clarity
     * Returns key decision metrics and terminal state info
     */
    function getCaseSummary(uint256 caseId) external view returns (
        CaseLifecycle lifecycle,
        bool resolved,
        bool executed,
        bool shouldRelease,
        uint256 evaluatedAt,
        uint256 executedAt,
        bool isCancelled,
        CancelReason cancelReason,
        address cancelledBy
    ) {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        return (
            arbitrationCase.lifecycle,
            arbitrationCase.resolved,
            arbitrationCase.executed,
            arbitrationCase.shouldRelease,
            arbitrationCase.evaluatedAt,
            arbitrationCase.executedAt,
            arbitrationCase.isCancelled,
            arbitrationCase.cancelReason,
            arbitrationCase.cancelledBy
        );
    }

    /**
     * @dev Get case proof details for verification
     * Returns proof hash, evaluator, and evidence metadata
     */
    function getCaseProof(uint256 caseId) external view returns (
        bytes32 evaluationHash,
        address evaluator,
        bytes32 sourceIdsHash,
        uint256 sourceCount,
        bytes32 evidenceHash,
        string memory model,
        string memory modelVersion
    ) {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        // Note: sourceCount is not stored directly; it's in the EvaluationProof
        // This function provides the metadata that is persisted
        return (
            arbitrationCase.evaluationHash,
            arbitrationCase.evaluator,
            arbitrationCase.sourceIdsHash,
            0, // sourceCount not persisted; passed only during evaluation
            arbitrationCase.evidenceHash,
            arbitrationCase.model,
            arbitrationCase.modelVersion
        );
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

    /**
     * @dev Configure reputation-weighted decision parameters
     */
    function setReputationThresholds(
        uint256 _baseConfidenceThresholdBps,
        uint256 _highScoreThreshold,
        uint256 _highScoreDiscount,
        uint256 _midScoreThreshold,
        uint256 _midScoreDiscount,
        uint256 _riskThreshold
    ) external onlyOwner {
        baseConfidenceThresholdBps = _baseConfidenceThresholdBps;
        highScoreThreshold = _highScoreThreshold;
        highScoreDiscount = _highScoreDiscount;
        midScoreThreshold = _midScoreThreshold;
        midScoreDiscount = _midScoreDiscount;
        riskThreshold = _riskThreshold;
    }

    /**
     * @dev Configure low-score agent constraints
     */
    function setLowScoreConstraints(
        uint256 _minEvidenceSources,
        uint256 _proofWindowSeconds,
        uint256 _cooldownSeconds
    ) external onlyOwner {
        lowScoreMinEvidenceSources = _minEvidenceSources;
        lowScoreProofWindowSeconds = _proofWindowSeconds;
        lowScoreCooldownSeconds = _cooldownSeconds;
    }

    function setTrustedEscrow(address escrow, bool isTrusted) external onlyOwner {
        require(escrow != address(0), "Invalid escrow");
        trustedEscrow[escrow] = isTrusted;
        emit TrustedEscrowSet(escrow, isTrusted);
    }

    function hashEvaluationProof(EvaluationProof calldata proof) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                EVALUATION_PROOF_TYPEHASH,
                proof.caseId,
                proof.shouldRelease,
                proof.confidenceBps,
                keccak256(bytes(proof.model)),
                keccak256(bytes(proof.modelVersion)),
                proof.sourceIdsHash,
                proof.sourceCount,
                proof.evidenceHash,
                proof.issuedAt,
                proof.expiresAt,
                proof.nonce
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
    }

    /**
     * @dev Calculate reputation-based discount on confidence threshold
     * Higher scores get larger discounts:
     * - Score 800+: 1000 bps discount (10%)
     * - Score 500-799: 500 bps discount (5%)
     * - Score <500: 0 bps discount (strict)
     */
    function getReputationDiscount(uint256 creditScore) public view returns (uint256) {
        if (creditScore >= highScoreThreshold) {
            return highScoreDiscount;
        } else if (creditScore >= midScoreThreshold) {
            return midScoreDiscount;
        }
        return 0;
    }

    /**
     * @dev Calculate required confidence threshold adjusted by agent reputation
     * requiredConfidenceBps = baseConfidenceThresholdBps - reputationDiscount
     */
    function getRequiredConfidenceBps(uint256 creditScore) public view returns (uint256) {
        uint256 discount = getReputationDiscount(creditScore);
        uint256 required = baseConfidenceThresholdBps - discount;
        return required;
    }

    /**
     * @dev Get decision parameters for a specific case
     */
    function getDecisionParams(uint256 caseId) external view returns (
        uint256 requiredThreshold,
        uint256 confidenceMargin,
        uint256 agentScore,
        uint256 appliedDiscount
    ) {
        ArbitrationCase storage arbitrationCase = cases[caseId];
        return (
            arbitrationCase.requiredConfidenceBps,
            arbitrationCase.confidenceMarginBps,
            arbitrationCase.agentScoreAtEvaluation,
            arbitrationCase.applyingReputationDiscount
        );
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    NAME_HASH,
                    VERSION_HASH,
                    block.chainid,
                    address(this)
                )
            );
    }

    // Utility functions
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
}
