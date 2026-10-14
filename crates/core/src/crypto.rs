use crate::error::{PeerChatError, Result};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use hkdf::Hkdf;
use sha2::Sha256;

pub const KEY_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;

/// Derive subkeys using HKDF-SHA256
pub fn hkdf_sha256(ikm: &[u8], salt: Option<&[u8]>, info: &[u8], okm: &mut [u8]) -> Result<()> {
    let hk = Hkdf::<Sha256>::new(salt, ikm);
    hk.expand(info, okm)
        .map_err(|e| PeerChatError::CryptoError(format!("HKDF expand failed: {:?}", e)))
}

/// Derive room key from secret URL fragment (#k=secret)
pub fn derive_room_key(secret: &str) -> Result<[u8; 32]> {
    let mut key = [0u8; 32];
    hkdf_sha256(secret.as_bytes(), None, b"peerchat-room-v1", &mut key)?;
    Ok(key)
}

/// Compute HMAC-SHA256
pub fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    use sha2::Digest;
    let mut padded_key = [0u8; 64];
    if key.len() > 64 {
        let hash = Sha256::digest(key);
        padded_key[..32].copy_from_slice(&hash);
    } else {
        padded_key[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= padded_key[i];
        opad[i] ^= padded_key[i];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(data);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_hash);
    let outer_hash = outer.finalize();

    let mut res = [0u8; 32];
    res.copy_from_slice(&outer_hash);
    res
}

/// Counter-based 96-bit nonce for AEAD frames
pub fn make_nonce(counter: u64, is_initiator: bool) -> [u8; NONCE_LEN] {
    let mut nonce = [0u8; NONCE_LEN];
    nonce[0] = if is_initiator { 1 } else { 0 };
    nonce[4..12].copy_from_slice(&counter.to_be_bytes());
    nonce
}

/// Encrypt data with ChaCha20-Poly1305
pub fn encrypt_aead(key: &[u8; 32], nonce: &[u8; 12], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new(key.into());
    let nonce_obj = Nonce::from_slice(nonce);
    cipher
        .encrypt(nonce_obj, plaintext)
        .map_err(|e| PeerChatError::CryptoError(format!("AEAD Encrypt error: {:?}", e)))
}

/// Decrypt data with ChaCha20-Poly1305
pub fn decrypt_aead(key: &[u8; 32], nonce: &[u8; 12], ciphertext: &[u8]) -> Result<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new(key.into());
    let nonce_obj = Nonce::from_slice(nonce);
    cipher
        .decrypt(nonce_obj, ciphertext)
        .map_err(|_| PeerChatError::DecryptionFailed)
}

/// BLAKE3 hash
pub fn blake3_hash(data: &[u8]) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(data);
    let hash = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(hash.as_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aead_roundtrip() {
        let key = [42u8; 32];
        let nonce = make_nonce(1, true);
        let msg = b"Hello, PeerChat over WebRTC!";
        let ciphertext = encrypt_aead(&key, &nonce, msg).unwrap();
        assert_ne!(&ciphertext[..], msg);
        let decrypted = decrypt_aead(&key, &nonce, &ciphertext).unwrap();
        assert_eq!(&decrypted[..], msg);
    }

    #[test]
    fn test_room_key_derivation() {
        let secret = "my-secret-room-token-123";
        let key1 = derive_room_key(secret).unwrap();
        let key2 = derive_room_key(secret).unwrap();
        assert_eq!(key1, key2);
    }
}
