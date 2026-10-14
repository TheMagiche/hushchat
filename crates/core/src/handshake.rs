use crate::crypto::{decrypt_aead, encrypt_aead, hkdf_sha256, hmac_sha256, make_nonce};
use crate::error::{PeerChatError, Result};
use crate::identity::{derive_user_id, Identity};
use crate::protocol::{decode_frame, encode_frame, Frame};
use ed25519_dalek::{Signature, Signer, VerifyingKey};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519Secret};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hello {
    pub version: u32,
    pub user_id: String,
    pub ed_pub: [u8; 32],
    pub x_pub: [u8; 32],
    pub eph_x_pub: [u8; 32],
    pub nonce: [u8; 16],
    pub room_proof: Option<[u8; 32]>,
    #[serde(with = "BigArray")]
    pub sig: [u8; 64],
}

impl Hello {
    /// Canonical bytes for transcript signing
    pub fn transcript_bytes(
        version: u32,
        user_id: &str,
        ed_pub: &[u8; 32],
        x_pub: &[u8; 32],
        eph_x_pub: &[u8; 32],
        nonce: &[u8; 16],
        room_proof: Option<&[u8; 32]>,
    ) -> Result<Vec<u8>> {
        #[derive(Serialize)]
        struct Transcript<'a> {
            version: u32,
            user_id: &'a str,
            ed_pub: &'a [u8; 32],
            x_pub: &'a [u8; 32],
            eph_x_pub: &'a [u8; 32],
            nonce: &'a [u8; 16],
            room_proof: Option<&'a [u8; 32]>,
        }

        let mut buf = Vec::new();
        ciborium::into_writer(
            &Transcript {
                version,
                user_id,
                ed_pub,
                x_pub,
                eph_x_pub,
                nonce,
                room_proof,
            },
            &mut buf,
        )
        .map_err(|e| PeerChatError::SerializationError(format!("CBOR error: {:?}", e)))?;
        Ok(buf)
    }
}

/// Active encrypted WebRTC DataChannel session between two peers
pub struct Session {
    pub is_initiator: bool,
    pub remote_user_id: String,
    pub remote_ed_pub: [u8; 32],
    pub remote_x_pub: [u8; 32],
    send_key: [u8; 32],
    recv_key: [u8; 32],
    send_counter: u64,
    recv_counter: u64,
}

impl Session {
    /// Create initiator Hello frame and state
    pub fn initiate_handshake(
        identity: &Identity,
        room_key: Option<&[u8; 32]>,
    ) -> Result<(Hello, HandshakeState)> {
        let mut eph_secret_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut eph_secret_bytes);
        let eph_secret = X25519Secret::from(eph_secret_bytes);
        let eph_x_pub = X25519PublicKey::from(&eph_secret).to_bytes();

        let mut nonce = [0u8; 16];
        OsRng.fill_bytes(&mut nonce);

        let transcript_before_proof = Hello::transcript_bytes(
            PROTOCOL_VERSION,
            identity.user_id(),
            identity.ed25519_pub(),
            identity.x25519_pub(),
            &eph_x_pub,
            &nonce,
            None,
        )?;

        let room_proof = room_key.map(|k| hmac_sha256(k, &transcript_before_proof));

        let full_transcript = Hello::transcript_bytes(
            PROTOCOL_VERSION,
            identity.user_id(),
            identity.ed25519_pub(),
            identity.x25519_pub(),
            &eph_x_pub,
            &nonce,
            room_proof.as_ref(),
        )?;

        let sig = identity.signing_key().sign(&full_transcript);

        let hello = Hello {
            version: PROTOCOL_VERSION,
            user_id: identity.user_id().to_string(),
            ed_pub: *identity.ed25519_pub(),
            x_pub: *identity.x25519_pub(),
            eph_x_pub,
            nonce,
            room_proof,
            sig: sig.to_bytes(),
        };

        let state = HandshakeState {
            is_initiator: true,
            my_hello: hello.clone(),
            my_eph_secret: eph_secret_bytes,
        };

        Ok((hello, state))
    }

    /// Respond to an initiator's Hello frame and establish responder session
    pub fn respond_handshake(
        identity: &Identity,
        remote_hello: &Hello,
        room_key: Option<&[u8; 32]>,
    ) -> Result<(Hello, Session)> {
        verify_hello(remote_hello, room_key)?;

        let mut eph_secret_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut eph_secret_bytes);
        let eph_secret = X25519Secret::from(eph_secret_bytes);
        let eph_x_pub = X25519PublicKey::from(&eph_secret).to_bytes();

        let mut nonce = [0u8; 16];
        OsRng.fill_bytes(&mut nonce);

        let transcript_before_proof = Hello::transcript_bytes(
            PROTOCOL_VERSION,
            identity.user_id(),
            identity.ed25519_pub(),
            identity.x25519_pub(),
            &eph_x_pub,
            &nonce,
            None,
        )?;

        let room_proof = room_key.map(|k| hmac_sha256(k, &transcript_before_proof));

        let full_transcript = Hello::transcript_bytes(
            PROTOCOL_VERSION,
            identity.user_id(),
            identity.ed25519_pub(),
            identity.x25519_pub(),
            &eph_x_pub,
            &nonce,
            room_proof.as_ref(),
        )?;

        let sig = identity.signing_key().sign(&full_transcript);

        let my_hello = Hello {
            version: PROTOCOL_VERSION,
            user_id: identity.user_id().to_string(),
            ed_pub: *identity.ed25519_pub(),
            x_pub: *identity.x25519_pub(),
            eph_x_pub,
            nonce,
            room_proof,
            sig: sig.to_bytes(),
        };

        // Derive keys as responder (is_initiator = false)
        let (send_key, recv_key) = derive_session_keys(
            &identity.x25519_secret(),
            &eph_secret,
            &X25519PublicKey::from(remote_hello.x_pub),
            &X25519PublicKey::from(remote_hello.eph_x_pub),
            remote_hello,
            &my_hello,
            false,
        )?;

        let session = Session {
            is_initiator: false,
            remote_user_id: remote_hello.user_id.clone(),
            remote_ed_pub: remote_hello.ed_pub,
            remote_x_pub: remote_hello.x_pub,
            send_key,
            recv_key,
            send_counter: 0,
            recv_counter: 0,
        };

        Ok((my_hello, session))
    }

    /// Complete initiator handshake with responder's Hello frame
    pub fn complete_handshake(
        identity: &Identity,
        state: HandshakeState,
        responder_hello: &Hello,
        room_key: Option<&[u8; 32]>,
    ) -> Result<Session> {
        verify_hello(responder_hello, room_key)?;

        let eph_secret = X25519Secret::from(state.my_eph_secret);
        let (send_key, recv_key) = derive_session_keys(
            &identity.x25519_secret(),
            &eph_secret,
            &X25519PublicKey::from(responder_hello.x_pub),
            &X25519PublicKey::from(responder_hello.eph_x_pub),
            &state.my_hello,
            responder_hello,
            true,
        )?;

        Ok(Session {
            is_initiator: true,
            remote_user_id: responder_hello.user_id.clone(),
            remote_ed_pub: responder_hello.ed_pub,
            remote_x_pub: responder_hello.x_pub,
            send_key,
            recv_key,
            send_counter: 0,
            recv_counter: 0,
        })
    }

    /// Seal an outgoing Frame into ciphertext
    pub fn seal_frame(&mut self, frame: &Frame) -> Result<Vec<u8>> {
        let plaintext = encode_frame(frame)?;
        let nonce = make_nonce(self.send_counter, self.is_initiator);
        self.send_counter += 1;
        encrypt_aead(&self.send_key, &nonce, &plaintext)
    }

    /// Open an incoming ciphertext into a Frame
    pub fn open_frame(&mut self, ciphertext: &[u8]) -> Result<Frame> {
        let nonce = make_nonce(self.recv_counter, !self.is_initiator);
        let plaintext = decrypt_aead(&self.recv_key, &nonce, ciphertext)?;
        self.recv_counter += 1;
        decode_frame(&plaintext)
    }
}

pub struct HandshakeState {
    pub is_initiator: bool,
    pub my_hello: Hello,
    pub my_eph_secret: [u8; 32],
}

/// Verify Hello structure, user_id derivation, signature, and room proof
pub fn verify_hello(hello: &Hello, expected_room_key: Option<&[u8; 32]>) -> Result<()> {
    if hello.version != PROTOCOL_VERSION {
        return Err(PeerChatError::HandshakeFailed(format!(
            "Unsupported protocol version {}",
            hello.version
        )));
    }

    let expected_user_id = derive_user_id(&hello.ed_pub);
    if hello.user_id != expected_user_id {
        return Err(PeerChatError::InvalidUserId);
    }

    if let Some(room_key) = expected_room_key {
        let transcript_before_proof = Hello::transcript_bytes(
            hello.version,
            &hello.user_id,
            &hello.ed_pub,
            &hello.x_pub,
            &hello.eph_x_pub,
            &hello.nonce,
            None,
        )?;
        let expected_proof = hmac_sha256(room_key, &transcript_before_proof);
        match hello.room_proof {
            Some(ref proof) if proof == &expected_proof => {}
            _ => return Err(PeerChatError::InvalidRoomProof),
        }
    }

    let full_transcript = Hello::transcript_bytes(
        hello.version,
        &hello.user_id,
        &hello.ed_pub,
        &hello.x_pub,
        &hello.eph_x_pub,
        &hello.nonce,
        hello.room_proof.as_ref(),
    )?;

    let vk = VerifyingKey::from_bytes(&hello.ed_pub)
        .map_err(|_| PeerChatError::CryptoError("Invalid public key in hello".into()))?;
    let sig = Signature::from_bytes(&hello.sig);

    vk.verify_strict(&full_transcript, &sig)
        .map_err(|_| PeerChatError::InvalidSignature)?;

    Ok(())
}

/// Triple DH key derivation (forward secrecy)
fn derive_session_keys(
    my_static_secret: &X25519Secret,
    my_eph_secret: &X25519Secret,
    remote_static_pub: &X25519PublicKey,
    remote_eph_pub: &X25519PublicKey,
    initiator_hello: &Hello,
    responder_hello: &Hello,
    is_initiator: bool,
) -> Result<([u8; 32], [u8; 32])> {
    // DH1: static - static
    let dh1 = my_static_secret.diffie_hellman(remote_static_pub);
    // DH2: eph - static / static - eph
    let dh2 = if is_initiator {
        my_eph_secret.diffie_hellman(remote_static_pub)
    } else {
        my_static_secret.diffie_hellman(remote_eph_pub)
    };
    // DH3: eph - eph
    let dh3 = my_eph_secret.diffie_hellman(remote_eph_pub);

    let mut ikm = Vec::with_capacity(96);
    ikm.extend_from_slice(dh1.as_bytes());
    ikm.extend_from_slice(dh2.as_bytes());
    ikm.extend_from_slice(dh3.as_bytes());

    let mut salt = Vec::with_capacity(32);
    salt.extend_from_slice(&initiator_hello.nonce);
    salt.extend_from_slice(&responder_hello.nonce);

    let mut key_material = [0u8; 64];
    hkdf_sha256(&ikm, Some(&salt), b"peerchat-session-v1", &mut key_material)?;

    let mut k1 = [0u8; 32];
    let mut k2 = [0u8; 32];
    k1.copy_from_slice(&key_material[0..32]);
    k2.copy_from_slice(&key_material[32..64]);

    if is_initiator {
        Ok((k1, k2)) // send = k1, recv = k2
    } else {
        Ok((k2, k1)) // send = k2, recv = k1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_handshake_and_secure_channel() {
        let alice = Identity::generate();
        let bob = Identity::generate();

        let (alice_hello, alice_state) = Session::initiate_handshake(&alice, None).unwrap();
        let (bob_hello, mut bob_session) =
            Session::respond_handshake(&bob, &alice_hello, None).unwrap();
        let mut alice_session =
            Session::complete_handshake(&alice, alice_state, &bob_hello, None).unwrap();

        // Alice sends a message to Bob
        let frame = Frame::Typing(true);
        let sealed = alice_session.seal_frame(&frame).unwrap();
        let opened = bob_session.open_frame(&sealed).unwrap();
        assert_eq!(frame, opened);

        // Bob replies
        let reply = Frame::Pong;
        let sealed_reply = bob_session.seal_frame(&reply).unwrap();
        let opened_reply = alice_session.open_frame(&sealed_reply).unwrap();
        assert_eq!(reply, opened_reply);
    }

    #[test]
    fn test_private_room_proof_rejection() {
        let alice = Identity::generate();
        let bob = Identity::generate();

        let room_key_alice = [1u8; 32];
        let room_key_bob = [2u8; 32];

        let (alice_hello, _) = Session::initiate_handshake(&alice, Some(&room_key_alice)).unwrap();
        let bob_res = Session::respond_handshake(&bob, &alice_hello, Some(&room_key_bob));
        assert!(bob_res.is_err());
    }
}
