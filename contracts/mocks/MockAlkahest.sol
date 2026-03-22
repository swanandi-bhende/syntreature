// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IAlkahest} from "../interfaces/IAlkahest.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockAlkahest
 * @dev Mock Alkahest for testing escrow flow
 */
contract MockAlkahest is IAlkahest {
    mapping(uint256 => Obligation) public obligations;
    uint256 public obligationCounter;

    constructor() {}

    function createDemand(
        string memory /* nlDescription */,
        bytes32 /* conditionHash */,
        uint256 /* releaseTime */
    ) external pure returns (uint256) {
        // Mock implementation
        return 1;
    }

    function lockFunds(
        uint256 /* demandId */,
        address token,
        uint256 amount,
        address /* arbiter */
    ) external returns (uint256) {
        uint256 obligationId = obligationCounter++;

        // Transfer funds
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // Store obligation
        obligations[obligationId] = Obligation({
            beneficiary: msg.sender,
            amount: amount,
            token: token,
            deadline: block.timestamp + 7 days,
            released: false
        });

        return obligationId;
    }

    function releaseFunds(uint256 obligationId) external {
        Obligation storage obl = obligations[obligationId];
        require(!obl.released, "Already released");

        obl.released = true;
        IERC20(obl.token).transfer(obl.beneficiary, obl.amount);
    }

    function clawback(uint256 obligationId) external {
        Obligation storage obl = obligations[obligationId];
        require(!obl.released, "Already released");

        obl.released = true;
        IERC20(obl.token).transfer(msg.sender, obl.amount);
    }
}
