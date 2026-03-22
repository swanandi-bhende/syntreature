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
    mapping(uint256 => ObligationState) private lifecycleObligations;
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

    function createObligation(
        uint256 demandId,
        ObligationTerms calldata terms,
        ConditionReference calldata condition,
        ArbiterConfig calldata arbiterConfig
    ) external returns (uint256 obligationId) {
        obligationId = obligationCounter++;

        lifecycleObligations[obligationId] = ObligationState({
            obligationId: obligationId,
            demandId: demandId,
            terms: terms,
            condition: condition,
            arbiterConfig: arbiterConfig,
            status: SettlementStatus.ObligationCreated,
            resolvedAt: 0,
            exists: true
        });

        emit ObligationCreated(
            obligationId,
            demandId,
            terms.requester,
            terms.beneficiary,
            condition.conditionHash
        );
    }

    function lockCollateral(uint256 obligationId, address token, uint256 amount) external {
        ObligationState storage state = lifecycleObligations[obligationId];
        require(state.exists, "Unknown obligation");
        require(state.status == SettlementStatus.ObligationCreated, "Invalid status");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        state.terms.collateralToken = token;
        state.terms.collateralAmount = amount;
        state.status = SettlementStatus.CollateralLocked;

        emit CollateralLocked(obligationId, token, amount, msg.sender);
    }

    function resolveObligation(
        uint256 obligationId,
        bool shouldRelease,
        bytes32 resolutionHash
    ) external {
        ObligationState storage state = lifecycleObligations[obligationId];
        require(state.exists, "Unknown obligation");
        require(state.status == SettlementStatus.CollateralLocked, "Invalid status");

        state.status = shouldRelease
            ? SettlementStatus.ResolvedRelease
            : SettlementStatus.ResolvedClawback;
        state.resolvedAt = block.timestamp;

        emit ObligationResolved(obligationId, shouldRelease, resolutionHash, msg.sender);
    }

    function releaseObligation(uint256 obligationId) external {
        ObligationState storage state = lifecycleObligations[obligationId];
        require(state.exists, "Unknown obligation");
        require(state.status == SettlementStatus.ResolvedRelease, "Not releasable");

        state.status = SettlementStatus.Released;

        if (state.terms.collateralAmount > 0 && state.terms.collateralToken != address(0)) {
            IERC20(state.terms.collateralToken).transfer(
                state.terms.beneficiary,
                state.terms.collateralAmount
            );
        }

        emit ObligationReleased(
            obligationId,
            state.terms.beneficiary,
            state.terms.collateralAmount
        );
    }

    function clawbackObligation(uint256 obligationId) external {
        ObligationState storage state = lifecycleObligations[obligationId];
        require(state.exists, "Unknown obligation");
        require(state.status == SettlementStatus.ResolvedClawback, "Not clawbackable");

        state.status = SettlementStatus.ClawedBack;

        if (state.terms.collateralAmount > 0 && state.terms.collateralToken != address(0)) {
            IERC20(state.terms.collateralToken).transfer(
                state.terms.requester,
                state.terms.collateralAmount
            );
        }

        emit ObligationClawedBack(
            obligationId,
            state.terms.requester,
            state.terms.collateralAmount
        );
    }

    function getObligation(uint256 obligationId) external view returns (ObligationState memory) {
        return lifecycleObligations[obligationId];
    }
}
