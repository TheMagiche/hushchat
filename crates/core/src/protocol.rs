use crate::error::{PeerChatError, Result};
use ed25519_dalek::{Signature, Signer, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub conversation: String,
    pub author: String,
    pub lamport: u64,
    pub sent_at_ms: u64,
    pub body: Body,
    #[serde(with = "BigArray")]
    pub sig: [u8; 64],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Body {
    Text { markdown: String },
    Reaction { target: String, emoji: String },
    Edit { target: String, markdown: String },
    Delete { target: String },
    File {
        manifest_id: String,
        name: String,
        size: u64,
        mime: String,
        data_url: Option<String>,
    },
    System(SystemEvent),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SystemEvent {
    PeerJoined { user_id: String, name: String },
    PeerLeft { user_id: String },
    RoomKeyRotated,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerInfo {
    pub user_id: String,
    pub peerjs_id: String,
    pub name: String,
    pub ed25519_pub: [u8; 32],
    pub x25519_pub: [u8; 32],
    pub is_anchor: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileManifest {
    pub file_id: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    pub chunk_size: u32,
    pub blake3_root: [u8; 32],
    pub key: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Frame {
    Msg(ChatMessage),
    Ack {
        ids: Vec<String>,
    },
    Typing(bool),
    Read {
        up_to: u64,
    },
    // rooms
    PeerList(Vec<PeerInfo>),
    Profile {
        name: String,
        avatar_hash: Option<[u8; 32]>,
    },
    BackfillReq {
        since: u64,
    },
    BackfillBatch(Vec<ChatMessage>),
    // DMs
    SyncReq {
        since: u64,
    },
    SyncBatch(Vec<ChatMessage>),
    // files
    FileOffer(FileManifest),
    FileReq {
        file_id: String,
        from_chunk: u32,
    },
    FileChunk {
        file_id: String,
        index: u32,
        data: Vec<u8>,
    },
    FileCancel {
        file_id: String,
    },
    // calls
    CallState {
        audio: bool,
        video: bool,
        screen: bool,
    },
    MediaRenegotiate,
    Ping,
    Pong,
}

pub const MAX_TEXT_LEN: usize = 10_000_000;
pub const MAX_FRAME_LEN: usize = 16_777_216; // 16 MiB

/// Canonical bytes representation for signing a ChatMessage
pub fn canonical_message_bytes(
    id: &str,
    conversation: &str,
    author: &str,
    lamport: u64,
    sent_at_ms: u64,
    body: &Body,
) -> Result<Vec<u8>> {
    #[derive(Serialize)]
    struct SignablePayload<'a> {
        id: &'a str,
        conversation: &'a str,
        author: &'a str,
        lamport: u64,
        sent_at_ms: u64,
        body: &'a Body,
    }

    let payload = SignablePayload {
        id,
        conversation,
        author,
        lamport,
        sent_at_ms,
        body,
    };

    let mut buf = Vec::new();
    ciborium::into_writer(&payload, &mut buf)
        .map_err(|e| PeerChatError::SerializationError(format!("CBOR encode error: {:?}", e)))?;
    Ok(buf)
}

/// Sign and construct a ChatMessage
pub fn create_chat_message(
    signing_key: &ed25519_dalek::SigningKey,
    id: String,
    conversation: String,
    author: String,
    lamport: u64,
    sent_at_ms: u64,
    body: Body,
) -> Result<ChatMessage> {
    if let Body::Text { ref markdown } = body {
        if markdown.len() > MAX_TEXT_LEN {
            return Err(PeerChatError::TextTooLong(markdown.len()));
        }
    }
    if let Body::Edit { ref markdown, .. } = body {
        if markdown.len() > MAX_TEXT_LEN {
            return Err(PeerChatError::TextTooLong(markdown.len()));
        }
    }
    if let Body::File { ref data_url, .. } = body {
        if let Some(ref url) = data_url {
            if url.len() > MAX_TEXT_LEN {
                return Err(PeerChatError::TextTooLong(url.len()));
            }
        }
    }

    let bytes = canonical_message_bytes(&id, &conversation, &author, lamport, sent_at_ms, &body)?;
    let signature = signing_key.sign(&bytes);

    Ok(ChatMessage {
        id,
        conversation,
        author,
        lamport,
        sent_at_ms,
        body,
        sig: signature.to_bytes(),
    })
}

/// Verify ChatMessage signature against author's Ed25519 public key
pub fn verify_chat_message(msg: &ChatMessage, author_pub: &[u8; 32]) -> Result<bool> {
    let vk = VerifyingKey::from_bytes(author_pub)
        .map_err(|_| PeerChatError::CryptoError("Invalid public key bytes".into()))?;

    let bytes = canonical_message_bytes(
        &msg.id,
        &msg.conversation,
        &msg.author,
        msg.lamport,
        msg.sent_at_ms,
        &msg.body,
    )?;

    let sig = Signature::from_bytes(&msg.sig);
    match vk.verify_strict(&bytes, &sig) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Encode Frame to CBOR
pub fn encode_frame(frame: &Frame) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    ciborium::into_writer(frame, &mut buf)
        .map_err(|e| PeerChatError::SerializationError(format!("CBOR encode error: {:?}", e)))?;
    if buf.len() > MAX_FRAME_LEN {
        return Err(PeerChatError::FrameTooLarge(buf.len()));
    }
    Ok(buf)
}

/// Decode Frame from CBOR
pub fn decode_frame(bytes: &[u8]) -> Result<Frame> {
    if bytes.len() > MAX_FRAME_LEN {
        return Err(PeerChatError::FrameTooLarge(bytes.len()));
    }
    ciborium::from_reader(bytes)
        .map_err(|e| PeerChatError::SerializationError(format!("CBOR decode error: {:?}", e)))
}

/// Helper for sorting messages by Lamport ordering: (lamport, author, id)
pub fn compare_messages(a: &ChatMessage, b: &ChatMessage) -> std::cmp::Ordering {
    a.lamport
        .cmp(&b.lamport)
        .then_with(|| a.author.cmp(&b.author))
        .then_with(|| a.id.cmp(&b.id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;

    #[test]
    fn test_message_sign_and_verify() {
        let id = Identity::generate();
        let msg = create_chat_message(
            &id.signing_key(),
            "msg-1".into(),
            "room-xyz".into(),
            id.user_id().to_string(),
            1,
            1234567890,
            Body::Text {
                markdown: "Hello peer!".into(),
            },
        )
        .unwrap();

        assert!(verify_chat_message(&msg, id.ed25519_pub()).unwrap());

        // Tamper test
        let mut tampered = msg.clone();
        tampered.body = Body::Text {
            markdown: "Hacked peer!".into(),
        };
        assert!(!verify_chat_message(&tampered, id.ed25519_pub()).unwrap());
    }

    #[test]
    fn test_frame_encode_decode() {
        let frame = Frame::Typing(true);
        let bytes = encode_frame(&frame).unwrap();
        let decoded = decode_frame(&bytes).unwrap();
        assert_eq!(frame, decoded);
    }
}
