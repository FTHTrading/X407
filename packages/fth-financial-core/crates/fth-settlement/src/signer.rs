//! Ed25519 signing utilities.

use ed25519_dalek::{SigningKey, VerifyingKey, Signer, Verifier, Signature};
use fth_types::FinError;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

/// Ed25519 signer backed by a 32-byte seed.
pub struct Ed25519Signer {
    signing_key: SigningKey,
}

impl Ed25519Signer {
    /// Create from a base64-encoded 32-byte seed.
    pub fn from_base64_seed(b64: &str) -> Result<Self, FinError> {
        let bytes = BASE64
            .decode(b64)
            .map_err(|e| FinError::CryptoError(format!("invalid base64 seed: {e}")))?;
        if bytes.len() != 32 {
            return Err(FinError::CryptoError(format!(
                "seed must be 32 bytes, got {}",
                bytes.len()
            )));
        }
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&bytes);
        Ok(Self {
            signing_key: SigningKey::from_bytes(&seed),
        })
    }

    /// Create from raw 32-byte seed.
    pub fn from_seed(seed: [u8; 32]) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(&seed),
        }
    }

    /// Sign a message and return the signature as base64.
    pub fn sign(&self, message: &[u8]) -> String {
        let sig = self.signing_key.sign(message);
        BASE64.encode(sig.to_bytes())
    }

    /// Get the public key as base64.
    pub fn public_key_base64(&self) -> String {
        BASE64.encode(self.signing_key.verifying_key().to_bytes())
    }

    /// Get the verifying key.
    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }
}

/// Verify an Ed25519 signature.
pub fn verify_signature(
    pubkey_b64: &str,
    message: &[u8],
    signature_b64: &str,
) -> Result<bool, FinError> {
    let pk_bytes = BASE64
        .decode(pubkey_b64)
        .map_err(|e| FinError::CryptoError(format!("invalid pubkey base64: {e}")))?;
    if pk_bytes.len() != 32 {
        return Err(FinError::CryptoError(format!(
            "pubkey must be 32 bytes, got {}",
            pk_bytes.len()
        )));
    }
    let mut pk_arr = [0u8; 32];
    pk_arr.copy_from_slice(&pk_bytes);

    let verifying_key = VerifyingKey::from_bytes(&pk_arr)
        .map_err(|e| FinError::CryptoError(format!("invalid pubkey: {e}")))?;

    let sig_bytes = BASE64
        .decode(signature_b64)
        .map_err(|e| FinError::CryptoError(format!("invalid signature base64: {e}")))?;
    if sig_bytes.len() != 64 {
        return Err(FinError::CryptoError(format!(
            "signature must be 64 bytes, got {}",
            sig_bytes.len()
        )));
    }
    let mut sig_arr = [0u8; 64];
    sig_arr.copy_from_slice(&sig_bytes);
    let signature = Signature::from_bytes(&sig_arr);

    Ok(verifying_key.verify(message, &signature).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_and_verify_roundtrip() {
        let seed = [42u8; 32];
        let signer = Ed25519Signer::from_seed(seed);
        let message = b"hello world";

        let sig = signer.sign(message);
        let pk = signer.public_key_base64();

        let valid = verify_signature(&pk, message, &sig).unwrap();
        assert!(valid);

        // Wrong message should fail
        let invalid = verify_signature(&pk, b"wrong", &sig).unwrap();
        assert!(!invalid);
    }
}
