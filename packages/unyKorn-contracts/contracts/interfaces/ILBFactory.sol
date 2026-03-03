// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  ILBFactory — TraderJoe Liquidity Book Factory (subset)
/// @notice Lookup existing LB pairs by token + bin step.
interface ILBFactory {

    /// @notice LB pair information
    struct LBPairInformation {
        uint16  binStep;
        address LBPair;
        bool    createdByOwner;
        bool    ignoredForRouting;
    }

    /// @notice Get all LB pairs for a given token pair
    function getAllLBPairs(address tokenX, address tokenY)
        external
        view
        returns (LBPairInformation[] memory);

    /// @notice Get the LB pair for a given token pair and bin step
    function getLBPairInformation(address tokenX, address tokenY, uint256 binStep)
        external
        view
        returns (LBPairInformation memory);

    /// @notice Get the number of preset bin steps
    function getNumberOfPresets() external view returns (uint256);
}
