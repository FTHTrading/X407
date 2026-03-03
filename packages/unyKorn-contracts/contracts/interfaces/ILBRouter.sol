// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  ILBRouter — TraderJoe Liquidity Book V2.1 Router (subset)
/// @notice Minimal interface for adding/removing liquidity on LFJ pools.
///         Full spec: https://docs.traderjoexyz.com/contracts/LBRouter
interface ILBRouter {

    /// @notice The liquidity parameters for adding liquidity to a bin
    struct LiquidityParameters {
        IERC20  tokenX;                // first token (e.g. UNY)
        IERC20  tokenY;                // second token (e.g. USDC / WAVAX)
        uint256 binStep;               // bin step of the pair
        uint256 amountX;               // amount of tokenX to deposit
        uint256 amountY;               // amount of tokenY to deposit
        uint256 amountXMin;            // minimum tokenX amount (slippage)
        uint256 amountYMin;            // minimum tokenY amount (slippage)
        uint256 activeIdDesired;       // target active bin id
        uint256 idSlippage;            // max bin id deviation
        int256[] deltaIds;             // bin ID offsets from active bin
        uint256[] distributionX;       // % of tokenX per bin (1e18 = 100%)
        uint256[] distributionY;       // % of tokenY per bin (1e18 = 100%)
        address to;                    // recipient of LP tokens
        address refundTo;              // address for refunded excess
        uint256 deadline;              // tx deadline (block.timestamp)
    }

    /// @notice Add liquidity to an LB pair
    function addLiquidity(LiquidityParameters calldata params)
        external
        returns (
            uint256 amountXAdded,
            uint256 amountYAdded,
            uint256 amountXLeft,
            uint256 amountYLeft,
            uint256[] memory depositIds,
            uint256[] memory liquidityMinted
        );

    /// @notice Add liquidity using native AVAX as tokenY
    function addLiquidityNATIVE(LiquidityParameters calldata params)
        external
        payable
        returns (
            uint256 amountXAdded,
            uint256 amountYAdded,
            uint256 amountXLeft,
            uint256 amountYLeft,
            uint256[] memory depositIds,
            uint256[] memory liquidityMinted
        );

    /// @notice Remove liquidity from an LB pair
    function removeLiquidity(
        IERC20  tokenX,
        IERC20  tokenY,
        uint16  binStep,
        uint256 amountXMin,
        uint256 amountYMin,
        uint256[] memory ids,
        uint256[] memory amounts,
        address to,
        uint256 deadline
    ) external returns (uint256 amountX, uint256 amountY);

    /// @notice Remove liquidity receiving native AVAX
    function removeLiquidityNATIVE(
        IERC20  token,
        uint16  binStep,
        uint256 amountTokenMin,
        uint256 amountNATIVEMin,
        uint256[] memory ids,
        uint256[] memory amounts,
        address payable to,
        uint256 deadline
    ) external returns (uint256 amountToken, uint256 amountNATIVE);

    /// @notice Get the LB pair for given tokens and bin step
    function getLBPairInformation(IERC20 tokenX, IERC20 tokenY, uint256 binStep)
        external
        view
        returns (
            address pair,
            bool    isV2_1,
            bool    isNew
        );

    /// @notice Swap exact tokens for tokens on a multi-hop path
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        uint256[] memory pairBinSteps,
        IERC20[] memory tokenPath,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);

    /// @notice Swap exact native AVAX for tokens
    function swapExactNATIVEForTokens(
        uint256 amountOutMin,
        uint256[] memory pairBinSteps,
        IERC20[] memory tokenPath,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountOut);

    /// @notice Get the factory address
    function getFactory() external view returns (address);

    /// @notice Get the WNATIVE token address (WAVAX on Avalanche)
    function getWNATIVE() external view returns (address);
}

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
