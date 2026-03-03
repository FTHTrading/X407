// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILBRouter.sol" as LBR;
import "./interfaces/ILBPair.sol";

/// @title  UnyKornLPManager
/// @notice Operator-controlled contract for managing liquidity positions on
///         TraderJoe Liquidity Book (LFJ) V2.1 pools on Avalanche C-Chain.
///
///         Supports:
///         • Adding liquidity to UNY/USDC and UNY/WAVAX pools
///         • Removing liquidity (full or partial)
///         • Collecting accrued trading fees
///         • Emergency token recovery
///
/// @dev    Only the owner (operator wallet) can call mutating functions.
///         This contract holds LP positions on behalf of the operator.
contract UnyKornLPManager is Ownable {
    using SafeERC20 for IERC20;

    // ── Immutables ────────────────────────────────────────────────────────────
    LBR.ILBRouter public immutable router;
    IERC20        public immutable uny;

    // ── Tracked positions ─────────────────────────────────────────────────────
    struct Position {
        address pair;           // LB pair address
        address tokenX;
        address tokenY;
        uint16  binStep;
        uint256[] binIds;       // bins where we have liquidity
        bool    active;
    }

    Position[] public positions;

    // ── Events ────────────────────────────────────────────────────────────────
    event LiquidityAdded(
        uint256 indexed positionId,
        address indexed pair,
        uint256 amountX,
        uint256 amountY,
        uint256 binsUsed
    );
    event LiquidityRemoved(
        uint256 indexed positionId,
        uint256 amountX,
        uint256 amountY
    );
    event FeesCollected(
        uint256 indexed positionId,
        uint256 amountX,
        uint256 amountY
    );
    event TokensRecovered(address indexed token, uint256 amount);

    // ── Errors ────────────────────────────────────────────────────────────────
    error InvalidPosition();
    error PositionInactive();
    error InsufficientBalance();

    // ── Constructor ───────────────────────────────────────────────────────────
    /// @param _router  TraderJoe LB Router address on Avalanche
    /// @param _uny     UNY token address
    /// @param _owner   Operator wallet (receives ownership)
    constructor(
        address _router,
        address _uny,
        address _owner
    ) Ownable(_owner) {
        router = LBR.ILBRouter(_router);
        uny    = IERC20(_uny);
    }

    // ── Add liquidity (ERC-20 pair) ───────────────────────────────────────────

    /// @notice Add liquidity to a UNY/<token> LB pool
    /// @param tokenY      The other token (USDC, WAVAX, etc.)
    /// @param binStep     Bin step of the target pair
    /// @param amountX     UNY amount to deposit
    /// @param amountY     tokenY amount to deposit
    /// @param activeId    Target active bin id
    /// @param idSlippage  Max bin id deviation allowed
    /// @param deltaIds    Array of bin offsets from active bin
    /// @param distX       Distribution % for UNY per bin (1e18 = 100%)
    /// @param distY       Distribution % for tokenY per bin
    /// @param slippageBps Slippage tolerance in basis points (e.g. 50 = 0.5%)
    function addLiquidity(
        address tokenY,
        uint256 binStep,
        uint256 amountX,
        uint256 amountY,
        uint256 activeId,
        uint256 idSlippage,
        int256[] calldata deltaIds,
        uint256[] calldata distX,
        uint256[] calldata distY,
        uint256 slippageBps
    ) external onlyOwner returns (uint256 positionId) {
        // Transfer tokens to this contract if needed
        _pullToken(address(uny), amountX);
        _pullToken(tokenY, amountY);

        // Approve router
        uny.approve(address(router), amountX);
        IERC20(tokenY).approve(address(router), amountY);

        uint256 minX = amountX * (10000 - slippageBps) / 10000;
        uint256 minY = amountY * (10000 - slippageBps) / 10000;

        LBR.ILBRouter.LiquidityParameters memory params = LBR.ILBRouter.LiquidityParameters({
            tokenX:          LBR.IERC20(address(uny)),
            tokenY:          LBR.IERC20(tokenY),
            binStep:         binStep,
            amountX:         amountX,
            amountY:         amountY,
            amountXMin:      minX,
            amountYMin:      minY,
            activeIdDesired: activeId,
            idSlippage:      idSlippage,
            deltaIds:        deltaIds,
            distributionX:   distX,
            distributionY:   distY,
            to:              address(this),
            refundTo:        address(this),
            deadline:        block.timestamp + 300
        });

        (uint256 xAdded, uint256 yAdded,,, uint256[] memory depositIds,) = router.addLiquidity(params);

        // Record position
        positionId = positions.length;
        positions.push(Position({
            pair:     _getPairAddress(address(uny), tokenY, uint16(binStep)),
            tokenX:   address(uny),
            tokenY:   tokenY,
            binStep:  uint16(binStep),
            binIds:   depositIds,
            active:   true
        }));

        emit LiquidityAdded(positionId, positions[positionId].pair, xAdded, yAdded, depositIds.length);
    }

    /// @notice Add liquidity with native AVAX as tokenY (for UNY/WAVAX pool)
    function addLiquidityNATIVE(
        uint256 binStep,
        uint256 amountX,
        uint256 activeId,
        uint256 idSlippage,
        int256[] calldata deltaIds,
        uint256[] calldata distX,
        uint256[] calldata distY,
        uint256 slippageBps
    ) external payable onlyOwner returns (uint256 positionId) {
        _pullToken(address(uny), amountX);
        uny.approve(address(router), amountX);

        uint256 amountY = msg.value;
        uint256 minX = amountX * (10000 - slippageBps) / 10000;
        uint256 minY = amountY * (10000 - slippageBps) / 10000;

        address wavax = router.getWNATIVE();

        LBR.ILBRouter.LiquidityParameters memory params = LBR.ILBRouter.LiquidityParameters({
            tokenX:          LBR.IERC20(address(uny)),
            tokenY:          LBR.IERC20(wavax),
            binStep:         binStep,
            amountX:         amountX,
            amountY:         amountY,
            amountXMin:      minX,
            amountYMin:      minY,
            activeIdDesired: activeId,
            idSlippage:      idSlippage,
            deltaIds:        deltaIds,
            distributionX:   distX,
            distributionY:   distY,
            to:              address(this),
            refundTo:        address(this),
            deadline:        block.timestamp + 300
        });

        (uint256 xAdded, uint256 yAdded,,, uint256[] memory depositIds,) =
            router.addLiquidityNATIVE{value: msg.value}(params);

        positionId = positions.length;
        positions.push(Position({
            pair:     _getPairAddress(address(uny), wavax, uint16(binStep)),
            tokenX:   address(uny),
            tokenY:   wavax,
            binStep:  uint16(binStep),
            binIds:   depositIds,
            active:   true
        }));

        emit LiquidityAdded(positionId, positions[positionId].pair, xAdded, yAdded, depositIds.length);
    }

    // ── Remove liquidity ──────────────────────────────────────────────────────

    /// @notice Remove all liquidity from a tracked position
    /// @param positionId  Index into positions[]
    /// @param amounts     LP amounts to burn per bin (match binIds order)
    function removeLiquidity(
        uint256 positionId,
        uint256[] calldata amounts
    ) external onlyOwner {
        Position storage pos = _getPosition(positionId);

        (uint256 amountX, uint256 amountY) = router.removeLiquidity(
            LBR.IERC20(pos.tokenX),
            LBR.IERC20(pos.tokenY),
            pos.binStep,
            0, // amountXMin — we trust on-chain for now
            0, // amountYMin
            pos.binIds,
            amounts,
            address(this),
            block.timestamp + 300
        );

        pos.active = false;
        emit LiquidityRemoved(positionId, amountX, amountY);
    }

    // ── Collect fees ──────────────────────────────────────────────────────────

    /// @notice Collect trading fees from a position's bins
    function collectFees(uint256 positionId) external onlyOwner {
        Position storage pos = _getPosition(positionId);
        ILBPair pair = ILBPair(pos.pair);

        (uint256 amountX, uint256 amountY) = pair.collectFees(address(this), pos.binIds);

        emit FeesCollected(positionId, amountX, amountY);
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// @notice Get number of tracked positions
    function positionCount() external view returns (uint256) {
        return positions.length;
    }

    /// @notice Get bin IDs for a position
    function getPositionBins(uint256 positionId) external view returns (uint256[] memory) {
        if (positionId >= positions.length) revert InvalidPosition();
        return positions[positionId].binIds;
    }

    /// @notice Get pending fees for a position
    function pendingFees(uint256 positionId)
        external
        view
        returns (uint256 feeX, uint256 feeY)
    {
        Position storage pos = _getPosition(positionId);
        ILBPair pair = ILBPair(pos.pair);
        (feeX, feeY) = pair.pendingFees(address(this), pos.binIds);
    }

    /// @notice Get the current active bin ID and price for a pair
    function getPoolState(address pairAddr)
        external
        view
        returns (uint24 activeId, uint128 reserveX, uint128 reserveY)
    {
        ILBPair pair = ILBPair(pairAddr);
        activeId = pair.getActiveId();
        (reserveX, reserveY) = pair.getReserves();
    }

    // ── Emergency / admin ─────────────────────────────────────────────────────

    /// @notice Recover any ERC-20 tokens stuck in this contract
    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
        emit TokensRecovered(token, amount);
    }

    /// @notice Recover native AVAX stuck in this contract
    function recoverNative() external onlyOwner {
        uint256 bal = address(this).balance;
        (bool ok,) = owner().call{value: bal}("");
        require(ok, "native transfer failed");
        emit TokensRecovered(address(0), bal);
    }

    /// @notice Accept native AVAX transfers (for refunds from router)
    receive() external payable {}

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _getPosition(uint256 id) internal view returns (Position storage) {
        if (id >= positions.length) revert InvalidPosition();
        if (!positions[id].active)  revert PositionInactive();
        return positions[id];
    }

    function _pullToken(address token, uint256 amount) internal {
        if (amount == 0) return;
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal < amount) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount - bal);
        }
    }

    function _getPairAddress(address tokenX, address tokenY, uint16 binStep)
        internal
        view
        returns (address)
    {
        (address pair,,) = router.getLBPairInformation(
            LBR.IERC20(tokenX),
            LBR.IERC20(tokenY),
            binStep
        );
        return pair;
    }
}
