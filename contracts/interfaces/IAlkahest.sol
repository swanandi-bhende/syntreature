// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

/**
 * @title IAlkahest
 * @dev Protocol-oriented interface boundary for Alkahest escrow lifecycle.
 *
 * Design note:
 * - The richer lifecycle surface below is the stable contract boundary used by this repo.
 * - Legacy methods are retained as adapter compatibility hooks so integrations remain
 *   stable across network-specific ABI differences.
 *
 * For full upstream protocol, see: https://github.com/arkhai-io/alkahest
 */
interface IAlkahest {
    enum SettlementStatus {
        Uninitialized,
        ObligationCreated,
        CollateralLocked,
        ResolvedRelease,
        ResolvedClawback,
        Released,
        ClawedBack,
        Cancelled
    }

    struct Demand {
        address requester;
        string nlDescription;
        bytes32 conditionHash;
        uint256 releaseTime;
        bool settled;
    }

    struct ObligationTerms {
        address requester;
        address beneficiary;
        address collateralToken;
        uint256 collateralAmount;
        uint256 releaseTime;
        uint256 createdAt;
    }

    struct ConditionReference {
        bytes32 conditionHash;
        string conditionURI;
        bytes32 parserMetadataHash;
        uint64 parserVersion;
    }

    struct ArbiterConfig {
        address arbiter;
        address resolver;
        bool reputationWeighted;
        uint256 minReputationScore;
        bytes32 policyHash;
    }

    struct ObligationState {
        uint256 obligationId;
        uint256 demandId;
        ObligationTerms terms;
        ConditionReference condition;
        ArbiterConfig arbiterConfig;
        SettlementStatus status;
        uint256 resolvedAt;
        bool exists;
    }

    event ObligationCreated(
        uint256 indexed obligationId,
        uint256 indexed demandId,
        address indexed requester,
        address beneficiary,
        bytes32 conditionHash
    );

    event CollateralLocked(
        uint256 indexed obligationId,
        address indexed token,
        uint256 amount,
        address indexed locker
    );

    event ObligationResolved(
        uint256 indexed obligationId,
        bool shouldRelease,
        bytes32 resolutionHash,
        address indexed resolver
    );

    event ObligationReleased(
        uint256 indexed obligationId,
        address indexed beneficiary,
        uint256 amount
    );

    event ObligationClawedBack(
        uint256 indexed obligationId,
        address indexed requester,
        uint256 amount
    );

    function createObligation(
        uint256 demandId,
        ObligationTerms calldata terms,
        ConditionReference calldata condition,
        ArbiterConfig calldata arbiterConfig
    ) external returns (uint256 obligationId);

    function lockCollateral(uint256 obligationId, address token, uint256 amount) external;

    function resolveObligation(
        uint256 obligationId,
        bool shouldRelease,
        bytes32 resolutionHash
    ) external;

    function releaseObligation(uint256 obligationId) external;

    function clawbackObligation(uint256 obligationId) external;

    function getObligation(uint256 obligationId) external view returns (ObligationState memory);

    // -----------------------------------------------------------------------
    // Adapter compatibility surface (legacy style methods)
    // -----------------------------------------------------------------------
    // Kept intentionally so downstream contracts can remain stable while an
    // adapter contract translates these calls to the richer lifecycle methods
    // on networks where upstream ABI differs.
    struct Obligation {
        address beneficiary;
        uint256 amount;
        address token;
        uint256 deadline;
        bool released;
    }

    function createDemand(
        string memory nlDescription,
        bytes32 conditionHash,
        uint256 releaseTime
    ) external returns (uint256 demandId);

    function lockFunds(
        uint256 demandId,
        address token,
        uint256 amount,
        address arbiter
    ) external returns (uint256 obligationId);

    function releaseFunds(uint256 obligationId) external;

    function clawback(uint256 obligationId) external;
}

/**
 * @title INaturalLanguageAgreements
 * @dev Interface for NL-to-onchain parsing
 * For full interface, see: https://github.com/arkhai-io/natural-language-agreements
 */
interface INaturalLanguageAgreements {
    struct ParsedAgreement {
        address requester;
        address beneficiary;
        uint256 amount;
        string conditionDescription;
        bool isValid;
    }

    function parseAgreement(string memory nlText) external view returns (ParsedAgreement memory);

    function hashCondition(string memory condition) external pure returns (bytes32);
}

/**
 * @title IERC8004
 * @dev Agent identity registry interface
 * See: https://github.com/ethereum/EIPs/pull/8004
 */
interface IERC8004 {
    function ownerOf(uint256 agentId) external view returns (address);

    function getAgentMetadata(uint256 agentId) external view returns (string memory);

    function updateCreditScore(uint256 agentId, uint256 newScore) external;
}

/**
 * @title IGMXPositionRouter
 * @dev GMX v2 position router interface (simplified)
 */
interface IGMXPositionRouter {
    struct CreateOrderParams {
        address account;
        address receiver;
        address callbackContract;
        address market;
        address initialCollateralToken;
        address swapPath;
        uint256 sizeDeltaUsd;
        uint256 initialCollateralDeltaAmount;
        bool isLong;
        bool shouldUnwrapNativeToken;
    }

    function createOrder(CreateOrderParams calldata params) external;

    function closeOrder(bytes32 key) external;
}

/**
 * @title IPriceFeed
 * @dev Chainlink price feed interface
 */
interface IPriceFeed {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}
