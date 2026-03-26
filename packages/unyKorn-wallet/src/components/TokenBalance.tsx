/**
 * src/components/TokenBalance.tsx
 * Displays UNY, AVAX, and USDC balances for the connected wallet.
 */

import {
  useAccount,
  useBalance,
  useReadContract,
  useChainId,
} from "wagmi";
import { avalanche, base } from "wagmi/chains";
import { formatUnits } from "viem";

import { UNY_TOKEN_ABI }                                  from "../abis/unyToken";
import {
  BASE_USDC_ADDRESS,
  UNYKORN_CHAIN,
  UNYKORN_EXPLORER_TX_BASE,
  UNYKORN_TREASURY_ADDRESS,
  UNY_TOKEN_ADDRESS,
  USDC_ADDRESS,
  WAVAX_ADDRESS,
} from "../wagmi";

function fmt(value: bigint, decimals: number, display = 4): string {
  const n = parseFloat(formatUnits(value, decimals));
  if (n === 0) return "0";
  if (n < 0.0001) return "< 0.0001";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: display,
  });
}

interface BalanceRowProps {
  label:    string;
  value:    string;
  ticker:   string;
  isLoading?: boolean;
}

function BalanceRow({ label, value, ticker, isLoading }: BalanceRowProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div>
        <p className="label">{label}</p>
        {isLoading ? (
          <span className="skeleton skeleton--wide" />
        ) : (
          <p className="value">{value} <span style={{ fontSize: 14, color: "var(--color-muted)" }}>{ticker}</span></p>
        )}
      </div>
    </div>
  );
}

export function TokenBalance() {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const isUnyKorn                = chainId === UNYKORN_CHAIN.id;
  const isAvalanche              = chainId === avalanche.id;
  const isBase                   = chainId === base.id;

  // Native balance (AVAX or MATIC)
  const { data: nativeBal, isLoading: nativeLoading, isError: nativeError } = useBalance({
    address,
    query: { enabled: isConnected },
  });

  // UNY balance
  const { data: unyRaw, isLoading: unyLoading, isError: unyError } = useReadContract({
    address:      UNY_TOKEN_ADDRESS,
    abi:          UNY_TOKEN_ABI,
    functionName: "balanceOf",
    args:         [address!],
    query:        { enabled: !!address && isAvalanche },
  });

  // USDC balance (native USDC on Avalanche)
  const { data: usdcRaw, isLoading: usdcLoading, isError: usdcError } = useReadContract({
    address:      isBase ? BASE_USDC_ADDRESS : USDC_ADDRESS,
    abi:          UNY_TOKEN_ABI,
    functionName: "balanceOf",
    args:         [address!],
    query:        { enabled: !!address && (isAvalanche || isBase) },
  });

  // WAVAX balance
  const { data: wavaxRaw, isLoading: wavaxLoading, isError: wavaxError } = useReadContract({
    address:      WAVAX_ADDRESS,
    abi:          UNY_TOKEN_ABI,
    functionName: "balanceOf",
    args:         [address!],
    query:        { enabled: !!address && isAvalanche },
  });

  const anyError = nativeError || unyError || usdcError || wavaxError;

  if (!isConnected) {
    return (
      <div className="card" style={{ textAlign: "center", color: "var(--color-muted)", padding: 40 }}>
        Connect your wallet to view balances.
      </div>
    );
  }

  if (anyError) {
    return (
      <div className="card">
        <h2 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Balances</h2>
        <p className="muted" style={{ marginBottom: 16, wordBreak: "break-all" }}>{address}</p>
        <p style={{ fontSize: 13, color: "var(--color-accent)", textAlign: "center", padding: "16px 0" }}>
          Unable to fetch balances. RPC may be temporarily unavailable.
        </p>
      </div>
    );
  }

  const nativeSymbol = nativeBal?.symbol ?? "—";
  const nativeValue  = nativeBal ? fmt(nativeBal.value, nativeBal.decimals, 6) : "—";

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>Balances</h2>
      <p className="muted" style={{ marginBottom: 16, wordBreak: "break-all" }}>{address}</p>

      <BalanceRow
        label={isUnyKorn ? "Agent balance" : "Native"}
        value={nativeValue}
        ticker={nativeSymbol}
        isLoading={nativeLoading}
      />

      {isUnyKorn && (
        <>
          <BalanceRow
            label="Invoice receiver"
            value={UNYKORN_TREASURY_ADDRESS}
            ticker="Treasury"
          />
          <BalanceRow
            label="Explorer"
            value={UNYKORN_EXPLORER_TX_BASE}
            ticker="tx"
          />
        </>
      )}

      {isAvalanche && (
        <>
          <BalanceRow
            label="UnyKorn Token"
            value={unyRaw !== undefined ? fmt(unyRaw as bigint, 18) : "—"}
            ticker="UNY"
            isLoading={unyLoading}
          />
          <BalanceRow
            label="Wrapped AVAX"
            value={wavaxRaw !== undefined ? fmt(wavaxRaw as bigint, 18, 6) : "—"}
            ticker="WAVAX"
            isLoading={wavaxLoading}
          />
          <BalanceRow
            label="USD Coin (native)"
            value={usdcRaw !== undefined ? fmt(usdcRaw as bigint, 6, 2) : "—"}
            ticker="USDC"
            isLoading={usdcLoading}
          />
        </>
      )}

      {isBase && (
        <BalanceRow
          label="USD Coin"
          value={usdcRaw !== undefined ? fmt(usdcRaw as bigint, 6, 2) : "—"}
          ticker="USDC"
          isLoading={usdcLoading}
        />
      )}

      {!isUnyKorn && !isAvalanche && !isBase && (
        <p className="muted" style={{ paddingTop: 16 }}>
          Switch to UnyKorn L1, Base, or Avalanche to see supported balances.
        </p>
      )}
    </div>
  );
}
