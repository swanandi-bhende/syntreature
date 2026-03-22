// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IPriceFeed, IERC8004} from "../interfaces/IAlkahest.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPriceFeed
 * @dev Mock Chainlink price feed for testing
 */
contract MockPriceFeed is IPriceFeed, Ownable {
    int256 public mockPrice = 3000 * 10 ** 8; // 3000 USD, 8 decimals (Chainlink standard)
    uint80 public roundId = 1;

    constructor() Ownable(msg.sender) {}

    function setPrice(int256 newPrice) external onlyOwner {
        mockPrice = newPrice;
        roundId++;
    }

    function latestRoundData()
        external
        view
        returns (uint80 _roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (roundId, mockPrice, block.timestamp, block.timestamp, roundId);
    }

    function decimals() external pure returns (uint8) {
        return 8; // Chainlink standard
    }
}

/**
 * @title MockERC8004
 * @dev Mock ERC-8004 agent registry for testing
 */
contract MockERC8004 is IERC8004 {
    mapping(uint256 => address) public agents;
    mapping(uint256 => uint256) public creditScores;
    mapping(uint256 => string) public metadata;

    constructor() {
        // Register a test agent
        agents[1] = msg.sender;
        creditScores[1] = 500;
    }

    function registerAgent(uint256 agentId, address agent, string memory _metadata) external {
        agents[agentId] = agent;
        metadata[agentId] = _metadata;
        creditScores[agentId] = 300; // Start at 300
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return agents[agentId];
    }

    function getAgentMetadata(uint256 agentId) external view returns (string memory) {
        return metadata[agentId];
    }

    function updateCreditScore(uint256 agentId, uint256 newScore) external {
        creditScores[agentId] = newScore;
    }

    function getCreditScore(uint256 agentId) external view returns (uint256) {
        return creditScores[agentId];
    }
}

/**
 * @title MockNaturalLanguageAgreements
 * @dev Mock NL parser for testing
 */
contract MockNaturalLanguageAgreements {
    struct ParsedAgreement {
        address requester;
        address beneficiary;
        uint256 amount;
        string conditionDescription;
        bool isValid;
    }

    function parseAgreement(string memory nlText) external view returns (ParsedAgreement memory) {
        return ParsedAgreement({
            requester: msg.sender,
            beneficiary: msg.sender,
            amount: 1 ether,
            conditionDescription: nlText,
            isValid: true
        });
    }

    function hashCondition(string memory condition) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(condition));
    }
}
