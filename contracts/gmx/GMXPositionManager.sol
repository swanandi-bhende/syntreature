// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGMXPositionRouter, IPriceFeed} from "../interfaces/IAlkahest.sol";

/**
 * @title GMXPositionManager
 * @dev Wrapper for GMX v2 position management
 * Simplifies interaction with GMX perpetual trading
 *
 * Deployed on Arbitrum for live trading during hackathon
 * Reference: https://github.com/gmx-io/gmx-interface (GMX v2)
 */
contract GMXPositionManager is Ownable {
    using SafeERC20 for IERC20;

    // GMX Router contract addresses (Arbitrum mainnet/testnet)
    address public positionRouter;
    address public exchangeRouter;

    // Price feeds
    address public ethPriceFeed; // Chainlink ETH/USD on Arbitrum

    // Trading state
    struct Position {
        bytes32 key;
        address market;
        address collateralToken;
        uint256 collateralAmount;
        uint256 sizeDeltaUsd;
        bool isLong;
        uint256 openedAt;
        uint256 openPrice;
        bool closed;
        uint256 closedAt;
        int256 pnl;
    }

    mapping(bytes32 => Position) public positions;
    bytes32[] public openPositions;

    // Events
    event PositionOpened(
        bytes32 indexed positionKey,
        address indexed market,
        uint256 collateralAmount,
        uint256 sizeDeltaUsd,
        bool isLong,
        uint256 openPrice
    );
    event PositionClosed(bytes32 indexed positionKey, int256 pnl, uint256 closePrice);

    /**
     * @dev Initialize GMX position manager
     */
    constructor(
        address _positionRouter,
        address _exchangeRouter,
        address _ethPriceFeed
    ) Ownable(msg.sender) {
        positionRouter = _positionRouter;
        exchangeRouter = _exchangeRouter;
        ethPriceFeed = _ethPriceFeed;
    }

    /**
     * @dev Open a perpetual position on GMX
     * Simplified flow - in production, integrate with GMX SDK
     *
     * @param market Market address (e.g., ETH/USD)
     * @param collateralToken Token to use as collateral (e.g., USDC)
     * @param collateralAmount Amount of collateral
     * @param sizeDeltaUsd USD notional size (5x leverage example: 50 USD collateral → 250 USD size)
     * @param isLong Whether to go long or short
     */
    function openPosition(
        address market,
        address collateralToken,
        uint256 collateralAmount,
        uint256 sizeDeltaUsd,
        bool isLong
    ) external onlyOwner returns (bytes32) {
        require(market != address(0), "Invalid market");
        require(collateralAmount > 0, "Invalid collateral");
        require(sizeDeltaUsd > 0, "Invalid size");

        // Get current ETH price from Chainlink
        uint256 currentPrice = _getETHPrice();

        // Generate position key (simplified - in production, use GMX's key generation)
        bytes32 positionKey = keccak256(
            abi.encodePacked(address(this), market, isLong, block.timestamp)
        );

        // Create position struct
        Position storage pos = positions[positionKey];
        pos.key = positionKey;
        pos.market = market;
        pos.collateralToken = collateralToken;
        pos.collateralAmount = collateralAmount;
        pos.sizeDeltaUsd = sizeDeltaUsd;
        pos.isLong = isLong;
        pos.openedAt = block.timestamp;
        pos.openPrice = currentPrice;
        pos.closed = false;

        openPositions.push(positionKey);

        // In production, call GMX router:
        // IGMXPositionRouter(positionRouter).createOrder(params)
        // For now, just emit event for off-chain indexing

        emit PositionOpened(positionKey, market, collateralAmount, sizeDeltaUsd, isLong, currentPrice);

        return positionKey;
    }

    /**
     * @dev Close an open position
     * Calculates PnL and settles with collateral
     */
    function closePosition(bytes32 positionKey) external onlyOwner returns (int256 pnl) {
        Position storage pos = positions[positionKey];
        require(!pos.closed, "Already closed");
        require(pos.openedAt > 0, "Position not found");

        uint256 closePrice = _getETHPrice();
        uint256 timeDelta = block.timestamp - pos.openedAt;

        // Simple PnL calculation: (closePrice - openPrice) * (sizeDeltaUsd / openPrice)
        if (pos.isLong) {
            pnl = int256((closePrice - pos.openPrice) * pos.sizeDeltaUsd) / int256(pos.openPrice) / 1e18;
        } else {
            pnl = int256((pos.openPrice - closePrice) * pos.sizeDeltaUsd) / int256(pos.openPrice) / 1e18;
        }

        pos.closed = true;
        pos.closedAt = block.timestamp;
        pos.pnl = pnl;

        // In production, call GMX router to close
        // IGMXPositionRouter(positionRouter).closeOrder(params)

        emit PositionClosed(positionKey, pnl, closePrice);

        return pnl;
    }

    /**
     * @dev Get current ETH price from Chainlink oracle
     */
    function _getETHPrice() internal view returns (uint256) {
        IPriceFeed priceFeed = IPriceFeed(ethPriceFeed);
        (, int256 price,,,) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");

        uint8 decimals = priceFeed.decimals();
        return uint256(price) * (10 ** (18 - decimals)); // Normalize to 18 decimals
    }

    /**
     * @dev Get all open positions
     */
    function getOpenPositions() external view returns (bytes32[] memory) {
        return openPositions;
    }

    /**
     * @dev Get position details
     */
    function getPosition(bytes32 positionKey) external view returns (Position memory) {
        return positions[positionKey];
    }

    /**
     * @dev Get current ETH price (external call)
     */
    function getCurrentETHPrice() external view returns (uint256) {
        return _getETHPrice();
    }

    /**
     * @dev Update GMX router addresses
     */
    function setRouterAddresses(address _positionRouter, address _exchangeRouter) external onlyOwner {
        positionRouter = _positionRouter;
        exchangeRouter = _exchangeRouter;
    }

    /**
     * @dev Update price feed address
     */
    function setPriceFeed(address _ethPriceFeed) external onlyOwner {
        ethPriceFeed = _ethPriceFeed;
    }
}
