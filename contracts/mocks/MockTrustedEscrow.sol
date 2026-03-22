// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

contract MockTrustedEscrow {
    bool public releaseCalled;
    bool public clawbackCalled;
    uint256 public lastCaseOrDemandId;

    function releaseFundsByArbiter(uint256 caseOrDemandId) external {
        releaseCalled = true;
        clawbackCalled = false;
        lastCaseOrDemandId = caseOrDemandId;
    }

    function clawbackByArbiter(uint256 caseOrDemandId) external {
        clawbackCalled = true;
        releaseCalled = false;
        lastCaseOrDemandId = caseOrDemandId;
    }
}
