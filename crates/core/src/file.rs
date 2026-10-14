use crate::crypto::{decrypt_aead, encrypt_aead};
use crate::error::{PeerChatError, Result};
use crate::protocol::FileManifest;
use rand_core::{OsRng, RngCore};

pub const DEFAULT_CHUNK_SIZE: u32 = 65_536; // 64 KiB

pub struct FileEncryptor {
    pub manifest: FileManifest,
}

impl FileEncryptor {
    pub fn new(file_id: String, name: String, size: u64, mime: String) -> Self {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);

        let manifest = FileManifest {
            file_id,
            name,
            size,
            mime,
            chunk_size: DEFAULT_CHUNK_SIZE,
            blake3_root: [0u8; 32], // to be populated or verified
            key,
        };

        Self { manifest }
    }

    pub fn encrypt_chunk(&self, chunk_index: u32, plaintext_chunk: &[u8]) -> Result<Vec<u8>> {
        let mut nonce = [0u8; 12];
        nonce[0..4].copy_from_slice(b"file");
        nonce[4..8].copy_from_slice(&chunk_index.to_be_bytes());
        encrypt_aead(&self.manifest.key, &nonce, plaintext_chunk)
    }
}

pub struct FileDecryptor {
    pub manifest: FileManifest,
    hasher: blake3::Hasher,
    pub next_expected_chunk: u32,
    pub received_bytes: u64,
}

impl FileDecryptor {
    pub fn new(manifest: FileManifest) -> Self {
        Self {
            manifest,
            hasher: blake3::Hasher::new(),
            next_expected_chunk: 0,
            received_bytes: 0,
        }
    }

    pub fn decrypt_chunk(&mut self, chunk_index: u32, ciphertext: &[u8]) -> Result<Vec<u8>> {
        if chunk_index != self.next_expected_chunk {
            return Err(PeerChatError::InvalidFileChunk(format!(
                "Out of order chunk. Expected {}, got {}",
                self.next_expected_chunk, chunk_index
            )));
        }

        let mut nonce = [0u8; 12];
        nonce[0..4].copy_from_slice(b"file");
        nonce[4..8].copy_from_slice(&chunk_index.to_be_bytes());

        let plaintext = decrypt_aead(&self.manifest.key, &nonce, ciphertext)?;
        self.hasher.update(&plaintext);
        self.received_bytes += plaintext.len() as u64;
        self.next_expected_chunk += 1;

        Ok(plaintext)
    }

    pub fn finalize_hash(&self) -> [u8; 32] {
        let hash = self.hasher.finalize();
        let mut out = [0u8; 32];
        out.copy_from_slice(hash.as_bytes());
        out
    }

    pub fn is_complete(&self) -> bool {
        self.received_bytes >= self.manifest.size
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_chunk_streaming() {
        let enc = FileEncryptor::new("file-1".into(), "test.txt".into(), 13, "text/plain".into());
        let mut dec = FileDecryptor::new(enc.manifest.clone());

        let chunk0 = b"Hello, World!";
        let encrypted = enc.encrypt_chunk(0, chunk0).unwrap();
        let decrypted = dec.decrypt_chunk(0, &encrypted).unwrap();
        assert_eq!(&decrypted[..], chunk0);
        assert!(dec.is_complete());
    }
}
