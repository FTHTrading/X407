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

// Styles are now managed in index.css (btn-connect, btn-chain, btn-account classes)
