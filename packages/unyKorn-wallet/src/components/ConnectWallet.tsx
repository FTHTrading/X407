/**
 * src/components/ConnectWallet.tsx
 * RainbowKit connect button wrapped in UnyKorn styling.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWallet() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <button onClick={openConnectModal} className="btn-connect">
                Connect Wallet
              </button>
            ) : chain.unsupported ? (
              <button onClick={openChainModal} className="btn-wrong-network">
                Wrong network
              </button>
            ) : (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button onClick={openChainModal} className="btn-chain">
                  {chain.hasIcon && chain.iconUrl && (
                    <img
                      alt={chain.name ?? "Chain icon"}
                      src={chain.iconUrl}
                      style={{ width: 16, height: 16, borderRadius: "50%" }}
                    />
                  )}
                  {chain.name}
                </button>
                <button onClick={openAccountModal} className="btn-account">
                  {account.displayName}
                  {account.displayBalance ? ` (${account.displayBalance})` : ""}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// ── Scoped styles ─────────────────────────────────────────────────────────────
const style = document.createElement("style");
style.textContent = `
  .btn-connect, .btn-wrong-network, .btn-chain, .btn-account {
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-connect:hover, .btn-wrong-network:hover, .btn-chain:hover, .btn-account:hover {
    opacity: 0.85;
  }
  .btn-wrong-network { background: #d9534f; }
  .btn-chain, .btn-account { background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); }
`;
document.head.appendChild(style);
