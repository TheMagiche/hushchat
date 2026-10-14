use crate::crypto::{blake3_hash, decrypt_aead, encrypt_aead};
use crate::error::{PeerChatError, Result};
use argon2::Argon2;
use ed25519_dalek::SigningKey;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519Secret};
use zeroize::Zeroize;

#[derive(Clone, Serialize, Deserialize)]
pub struct IdentityKeys {
    pub ed25519_secret: [u8; 32],
    pub x25519_secret: [u8; 32],
}

impl Drop for IdentityKeys {
    fn drop(&mut self) {
        self.ed25519_secret.zeroize();
        self.x25519_secret.zeroize();
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicBundle {
    pub user_id: String,
    pub ed25519_pub: [u8; 32],
    pub x25519_pub: [u8; 32],
}

#[derive(Clone)]
pub struct Identity {
    keys: IdentityKeys,
    pub public_bundle: PublicBundle,
}

impl Identity {
    /// Generate a new identity with fresh Ed25519 and X25519 keys
    pub fn generate() -> Self {
        let mut ed_secret_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut ed_secret_bytes);
        let signing_key = SigningKey::from_bytes(&ed_secret_bytes);
        let ed_pub = signing_key.verifying_key().to_bytes();

        let mut x_secret_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut x_secret_bytes);
        let x_secret = X25519Secret::from(x_secret_bytes);
        let x_pub = X25519PublicKey::from(&x_secret).to_bytes();

        let user_id = derive_user_id(&ed_pub);

        Self {
            keys: IdentityKeys {
                ed25519_secret: ed_secret_bytes,
                x25519_secret: x_secret_bytes,
            },
            public_bundle: PublicBundle {
                user_id,
                ed25519_pub: ed_pub,
                x25519_pub: x_pub,
            },
        }
    }

    /// Restore an identity from raw secrets
    pub fn from_secrets(ed25519_secret: [u8; 32], x25519_secret: [u8; 32]) -> Result<Self> {
        let signing_key = SigningKey::from_bytes(&ed25519_secret);
        let ed_pub = signing_key.verifying_key().to_bytes();

        let x_secret = X25519Secret::from(x25519_secret);
        let x_pub = X25519PublicKey::from(&x_secret).to_bytes();

        let user_id = derive_user_id(&ed_pub);

        Ok(Self {
            keys: IdentityKeys {
                ed25519_secret,
                x25519_secret,
            },
            public_bundle: PublicBundle {
                user_id,
                ed25519_pub: ed_pub,
                x25519_pub: x_pub,
            },
        })
    }

    pub fn user_id(&self) -> &str {
        &self.public_bundle.user_id
    }

    pub fn ed25519_pub(&self) -> &[u8; 32] {
        &self.public_bundle.ed25519_pub
    }

    pub fn x25519_pub(&self) -> &[u8; 32] {
        &self.public_bundle.x25519_pub
    }

    pub fn signing_key(&self) -> SigningKey {
        SigningKey::from_bytes(&self.keys.ed25519_secret)
    }

    pub fn x25519_secret(&self) -> X25519Secret {
        X25519Secret::from(self.keys.x25519_secret)
    }

    /// Export keys encrypted with an Argon2id-derived key from a passphrase
    pub fn export_encrypted(&self, passphrase: &str) -> Result<Vec<u8>> {
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);

        let mut derived_key = [0u8; 32];
        let argon2 = Argon2::default();
        argon2
            .hash_password_into(passphrase.as_bytes(), &salt, &mut derived_key)
            .map_err(|e| PeerChatError::CryptoError(format!("Argon2 hash failed: {:?}", e)))?;

        let mut plaintext = Vec::with_capacity(64);
        plaintext.extend_from_slice(&self.keys.ed25519_secret);
        plaintext.extend_from_slice(&self.keys.x25519_secret);

        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);

        let ciphertext = encrypt_aead(&derived_key, &nonce, &plaintext)?;
        derived_key.zeroize();
        plaintext.zeroize();

        // format: [salt (16)] + [nonce (12)] + [ciphertext]
        let mut out = Vec::with_capacity(16 + 12 + ciphertext.len());
        out.extend_from_slice(&salt);
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ciphertext);
        Ok(out)
    }

    /// Import keys from an encrypted blob
    pub fn import_encrypted(blob: &[u8], passphrase: &str) -> Result<Self> {
        if blob.len() < 28 {
            return Err(PeerChatError::SerializationError(
                "Encrypted blob is too short".into(),
            ));
        }

        let salt = &blob[0..16];
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&blob[16..28]);
        let ciphertext = &blob[28..];

        let mut derived_key = [0u8; 32];
        let argon2 = Argon2::default();
        argon2
            .hash_password_into(passphrase.as_bytes(), salt, &mut derived_key)
            .map_err(|e| PeerChatError::CryptoError(format!("Argon2 hash failed: {:?}", e)))?;

        let plaintext = decrypt_aead(&derived_key, &nonce, ciphertext)?;
        derived_key.zeroize();

        if plaintext.len() != 64 {
            return Err(PeerChatError::SerializationError(
                "Invalid decrypted key length".into(),
            ));
        }

        let mut ed_secret = [0u8; 32];
        ed_secret.copy_from_slice(&plaintext[0..32]);
        let mut x_secret = [0u8; 32];
        x_secret.copy_from_slice(&plaintext[32..64]);

        Self::from_secrets(ed_secret, x_secret)
    }

    /// Generate a PeerJS ID for session: `userId + "-" + 6 random base58 chars`
    pub fn generate_peerjs_id(&self) -> String {
        let mut rnd = [0u8; 5];
        OsRng.fill_bytes(&mut rnd);
        let suffix = bs58::encode(&rnd).into_string();
        let suffix_6 = if suffix.len() >= 6 {
            &suffix[..6]
        } else {
            &suffix
        };
        format!("{}-{}", self.user_id(), suffix_6)
    }
}

/// Derive User ID: `"pc-" + base58(blake3(ed25519_pub))[..20]`
pub fn derive_user_id(ed25519_pub: &[u8; 32]) -> String {
    let hash = blake3_hash(ed25519_pub);
    let b58 = bs58::encode(hash).into_string();
    let prefix = if b58.len() >= 20 { &b58[..20] } else { &b58 };
    format!("pc-{}", prefix)
}

/// Verify that a user ID matches its Ed25519 public key
pub fn verify_user_id(user_id: &str, ed25519_pub: &[u8; 32]) -> bool {
    derive_user_id(ed25519_pub) == user_id
}

/// Compute 60-digit safety number between two public keys
pub fn compute_safety_number(pub1: &[u8; 32], pub2: &[u8; 32]) -> String {
    let mut combined = Vec::with_capacity(64);
    if pub1 <= pub2 {
        combined.extend_from_slice(pub1);
        combined.extend_from_slice(pub2);
    } else {
        combined.extend_from_slice(pub2);
        combined.extend_from_slice(pub1);
    }

    let h1 = blake3_hash(&combined);
    let h2 = blake3_hash(&h1);
    let h3 = blake3_hash(&h2);

    let mut all_bytes = Vec::with_capacity(96);
    all_bytes.extend_from_slice(&h1);
    all_bytes.extend_from_slice(&h2);
    all_bytes.extend_from_slice(&h3);

    // Convert into 12 blocks of 5 digits (60 digits total)
    let mut chunks = Vec::with_capacity(12);
    for i in 0..12 {
        let chunk_slice = &all_bytes[i * 8..(i + 1) * 8];
        let val = u64::from_be_bytes(chunk_slice.try_into().unwrap_or([0; 8]));
        let digits = format!("{:05}", val % 100_000);
        chunks.push(digits);
    }

    chunks.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_generation_and_derivation() {
        let id = Identity::generate();
        assert!(id.user_id().starts_with("pc-"));
        assert!(verify_user_id(id.user_id(), id.ed25519_pub()));
    }

    #[test]
    fn test_export_import_encrypted() {
        let id = Identity::generate();
        let pass = "strong_password_123!";
        let blob = id.export_encrypted(pass).unwrap();
        let restored = Identity::import_encrypted(&blob, pass).unwrap();
        assert_eq!(id.user_id(), restored.user_id());
        assert_eq!(id.ed25519_pub(), restored.ed25519_pub());
        assert_eq!(id.x25519_pub(), restored.x25519_pub());
    }

    #[test]
    fn test_safety_number_symmetry() {
        let id1 = Identity::generate();
        let id2 = Identity::generate();
        let sn1 = compute_safety_number(id1.ed25519_pub(), id2.ed25519_pub());
        let sn2 = compute_safety_number(id2.ed25519_pub(), id1.ed25519_pub());
        assert_eq!(sn1, sn2);
        assert_eq!(sn1.len(), 71); // 12 * 5 digits + 11 spaces
    }
}
