// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

/**
 * @title IAlkahest
 * @dev Simplified interface to Alkahest escrow protocol
 * For full interface, see: https://github.com/arkhai-io/alkahest
 */
interface IAlkahest {
    struct Demand {
        address requester;
        string nlDescription;
        bytes32 conditionHash;
        uint256 releaseTime;
        bool settled;
    }

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
