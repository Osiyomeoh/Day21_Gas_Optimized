// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OptimizedVesting {
    struct VestingSchedule {
        uint128 totalAmount;
        uint128 released;
        uint64 start;
        uint64 duration;
        uint64 lockupDuration;
        address beneficiary;
    }

    VestingSchedule private vestingSchedule;

    event Deposited(uint256 amount);
    event Released(uint256 amount);

    error ZeroAddress();
    error InvalidDuration();
    error LockupTooLong();
    error NoEtherDue();
    error TransferFailed();

    constructor(
        address _beneficiary,
        uint64 _start,
        uint64 _lockupDuration,
        uint64 _duration
    ) {
        if (_beneficiary == address(0)) revert ZeroAddress();
        if (_duration == 0) revert InvalidDuration();
        if (_lockupDuration > _duration) revert LockupTooLong();

        vestingSchedule = VestingSchedule({
            beneficiary: _beneficiary,
            start: _start,
            lockupDuration: _lockupDuration,
            duration: _duration,
            totalAmount: 0,
            released: 0
        });
    }

    receive() external payable {
        _deposit();
    }

    function deposit() external payable {
        _deposit();
    }

    function _deposit() internal {
        vestingSchedule.totalAmount += uint128(msg.value);
        emit Deposited(msg.value);
    }

    function release() external {
        uint256 unreleased = _releasableAmount();
        if (unreleased == 0) revert NoEtherDue();

        vestingSchedule.released += uint128(unreleased);
        emit Released(unreleased);

        (bool success, ) = vestingSchedule.beneficiary.call{value: unreleased}("");
        if (!success) revert TransferFailed();
    }

    function _releasableAmount() internal view returns (uint256) {
        return _vestedAmount() - vestingSchedule.released;
    }

    function _vestedAmount() internal view returns (uint256) {
        uint256 currentTime = block.timestamp;
        uint256 vestingStart = vestingSchedule.start;
        uint256 lockupEnd = vestingStart + vestingSchedule.lockupDuration;
        
        if (currentTime < lockupEnd) {
            return 0;
        }
        
        if (currentTime >= vestingStart + vestingSchedule.duration) {
            return vestingSchedule.totalAmount;
        }
        
        // Calculate vesting amount only for the period after lockup
        uint256 vestingDuration = vestingSchedule.duration - vestingSchedule.lockupDuration;
        uint256 timeVesting = currentTime - lockupEnd;
        
        return (uint256(vestingSchedule.totalAmount) * timeVesting) / vestingDuration;
    }

    function getVestingSchedule() external view returns (
        address beneficiary,
        uint256 totalAmount,
        uint256 released,
        uint256 start,
        uint256 duration,
        uint256 lockupDuration
    ) {
        return (
            vestingSchedule.beneficiary,
            vestingSchedule.totalAmount,
            vestingSchedule.released,
            vestingSchedule.start,
            vestingSchedule.duration,
            vestingSchedule.lockupDuration
        );
    }

    function releasableAmount() external view returns (uint256) {
        return _releasableAmount();
    }

    function vestedAmount() external view returns (uint256) {
        return _vestedAmount();
    }
}