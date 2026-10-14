use thiserror::Error;

#[derive(Error, Debug)]
pub enum PeerChatError {
    #[error("Serialization/Deserialization error: {0}")]
    SerializationError(String),

    #[error("Cryptographic error: {0}")]
    CryptoError(String),

    #[error("Invalid signature")]
    InvalidSignature,

    #[error("Handshake verification failed: {0}")]
    HandshakeFailed(String),

    #[error("Invalid user ID or derivation mismatch")]
    InvalidUserId,

    #[error("Missing or invalid room proof")]
    InvalidRoomProof,

    #[error("Decryption failed / message authentication failed")]
    DecryptionFailed,

    #[error("Frame too large (max {0} bytes)")]
    FrameTooLarge(usize),

    #[error("Text message too long (max {0} chars)")]
    TextTooLong(usize),

    #[error("Invalid file chunk: {0}")]
    InvalidFileChunk(String),

    #[error("Invalid state: {0}")]
    InvalidState(String),
}

pub type Result<T> = std::result::Result<T, PeerChatError>;
