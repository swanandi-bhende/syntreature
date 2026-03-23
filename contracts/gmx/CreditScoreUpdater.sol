// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC8004} from "../interfaces/IAlkahest.sol";

/**
 * @title CreditScoreUpdater
 * @dev Indirect ERC-8004 linkage adapter.
 *
 * Flow:
 * 1) GMXPositionManager emits TradeResultFinalized + CreditUpdateRequested on close tx.
 * 2) GMXPositionManager calls requestCreditUpdate(...) here (same close tx) to queue update.
 * 3) A separate score update tx calls applyQueuedUpdate(...), writing ERC-8004 score.
 */
contract CreditScoreUpdater is Ownable {
    struct PendingUpdate {
        bool exists;
        uint256 agentId;
        int256 pnl;
        int256 recommendedDelta;
        address requestedBy;
        uint256 requestedAt;
    }

    address public creditRegistry;
    address public allowedSource;

    // Deterministic policy parameters
    int256 public profitableDelta = 25;
    int256 public lossDelta = -25;
    int256 public neutralDelta = 0;

    mapping(bytes32 => PendingUpdate) public pendingUpdates;

    event CreditUpdateQueued(
        uint256 indexed agentId,
        bytes32 indexed positionKey,
        int256 pnl,
        int256 recommendedDelta,
        address indexed requestedBy,
        uint256 requestedAt
    );

    event CreditScoreUpdated(
        uint256 indexed agentId,
        bytes32 indexed positionKey,
        uint256 scoreBefore,
        uint256 scoreAfter,
        int256 appliedDelta,
        bytes32 reasonHash,
        uint256 updatedAt
    );

    event PolicyUpdated(int256 profitableDelta, int256 lossDelta, int256 neutralDelta);
    event CreditRegistrySet(address indexed registry);
    event AllowedSourceSet(address indexed source);

    modifier onlyAllowedSource() {
        require(msg.sender == allowedSource, "not allowed source");
        _;
    }

    constructor(address _creditRegistry, address _allowedSource) Ownable(msg.sender) {
        creditRegistry = _creditRegistry;
        allowedSource = _allowedSource;
        emit CreditRegistrySet(_creditRegistry);
        emit AllowedSourceSet(_allowedSource);
    }

    function setCreditRegistry(address registry) external onlyOwner {
        creditRegistry = registry;
        emit CreditRegistrySet(registry);
    }

    function setAllowedSource(address source) external onlyOwner {
        allowedSource = source;
        emit AllowedSourceSet(source);
    }

    function setPolicy(int256 _profitableDelta, int256 _lossDelta, int256 _neutralDelta) external onlyOwner {
        profitableDelta = _profitableDelta;
        lossDelta = _lossDelta;
        neutralDelta = _neutralDelta;
        emit PolicyUpdated(_profitableDelta, _lossDelta, _neutralDelta);
    }

    function requestCreditUpdate(
        uint256 agentId,
        bytes32 positionKey,
        int256 pnl,
        int256 recommendedDelta
    ) external onlyAllowedSource {
        pendingUpdates[positionKey] = PendingUpdate({
            exists: true,
            agentId: agentId,
            pnl: pnl,
            recommendedDelta: recommendedDelta,
            requestedBy: msg.sender,
            requestedAt: block.timestamp
        });

        emit CreditUpdateQueued(agentId, positionKey, pnl, recommendedDelta, msg.sender, block.timestamp);
    }

    function computePolicyDelta(int256 pnl) public view returns (int256) {
        if (pnl > 0) return profitableDelta;
        if (pnl < 0) return lossDelta;
        return neutralDelta;
    }

    function applyQueuedUpdate(bytes32 positionKey, uint256 scoreBefore) external onlyOwner returns (uint256 scoreAfter) {
        PendingUpdate memory p = pendingUpdates[positionKey];
        require(p.exists, "pending update not found");

        int256 policyDelta = computePolicyDelta(p.pnl);
        int256 effectiveDelta = p.recommendedDelta != 0 ? p.recommendedDelta : policyDelta;

        int256 candidate = int256(scoreBefore) + effectiveDelta;
        if (candidate < 0) {
            candidate = 0;
        }
        if (candidate > 1000) {
            candidate = 1000;
        }

        scoreAfter = uint256(candidate);
        IERC8004(creditRegistry).updateCreditScore(p.agentId, scoreAfter);

        bytes32 reasonHash = keccak256(
            abi.encodePacked("trade_result_position_key_", positionKey)
        );

        emit CreditScoreUpdated(
            p.agentId,
            positionKey,
            scoreBefore,
            scoreAfter,
            effectiveDelta,
            reasonHash,
            block.timestamp
        );

        delete pendingUpdates[positionKey];
    }
}
