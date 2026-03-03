// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  ILBPair — TraderJoe Liquidity Book Pair (subset)
/// @notice Read interface for querying LB pair state (active bin, reserves, fees).
interface ILBPair {

    /// @notice Get the active bin ID (where the current price sits)
    function getActiveId() external view returns (uint24);

    /// @notice Get the bin reserves at a specific bin ID
    function getBin(uint24 id) external view returns (uint128 binReserveX, uint128 binReserveY);

    /// @notice Get the token X of the pair
    function getTokenX() external view returns (address);

    /// @notice Get the token Y of the pair
    function getTokenY() external view returns (address);

    /// @notice Get the bin step of the pair (basis points between bins)
    function getBinStep() external view returns (uint16);

    /// @notice Get the total fees generated for a given account across all bins
    function pendingFees(address account, uint256[] calldata ids)
        external
        view
        returns (uint256 amountX, uint256 amountY);

    /// @notice Collect accumulated fees from specified bins
    function collectFees(address account, uint256[] calldata ids)
        external
        returns (uint256 amountX, uint256 amountY);

    /// @notice Get the reserves of the pair
    function getReserves() external view returns (uint128 reserveX, uint128 reserveY);

    /// @notice Get the oracle parameters
    function getOracleParameters()
        external
        view
        returns (
            uint8   sampleLifetime,
            uint16  size,
            uint16  activeSize,
            uint40  lastUpdated,
            uint40  firstTimestamp
        );

    /// @notice Get price from bin id: price = (1 + binStep/10000)^(id - 2^23)
    function getPriceFromId(uint24 id) external pure returns (uint256);

    /// @notice Get the bin id from a price
    function getIdFromPrice(uint256 price) external pure returns (uint24);

    /// @notice Batch balance query — how much liquidity does `account` have in each bin
    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory);

    /// @notice Single balance query
    function balanceOf(address account, uint256 id) external view returns (uint256);

    /// @notice Total supply for a given bin
    function totalSupply(uint256 id) external view returns (uint256);
}
