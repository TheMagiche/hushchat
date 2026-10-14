use peerchat_core::{
    compute_safety_number, derive_room_key, derive_user_id, Body, ChatMessage,
    FileDecryptor as CoreFileDecryptor, FileEncryptor as CoreFileEncryptor, FileManifest, Frame,
    HandshakeState as CoreHandshakeState, Hello, Identity as CoreIdentity, Session as CoreSession,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct WasmIdentity {
    inner: CoreIdentity,
}

impl Default for WasmIdentity {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WasmIdentity {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmIdentity {
        WasmIdentity {
            inner: CoreIdentity::generate(),
        }
    }

    #[wasm_bindgen(js_name = fromSecrets)]
    pub fn from_secrets(ed_secret: &[u8], x_secret: &[u8]) -> Result<WasmIdentity, JsValue> {
        if ed_secret.len() != 32 || x_secret.len() != 32 {
            return Err(JsValue::from_str(
                "Invalid secret key lengths (expected 32 bytes each)",
            ));
        }
        let mut ed = [0u8; 32];
        ed.copy_from_slice(ed_secret);
        let mut x = [0u8; 32];
        x.copy_from_slice(x_secret);

        let inner =
            CoreIdentity::from_secrets(ed, x).map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(WasmIdentity { inner })
    }

    #[wasm_bindgen(js_name = userId)]
    pub fn user_id(&self) -> String {
        self.inner.user_id().to_string()
    }

    #[wasm_bindgen(js_name = ed25519Pub)]
    pub fn ed25519_pub(&self) -> Vec<u8> {
        self.inner.ed25519_pub().to_vec()
    }

    #[wasm_bindgen(js_name = x25519Pub)]
    pub fn x25519_pub(&self) -> Vec<u8> {
        self.inner.x25519_pub().to_vec()
    }

    #[wasm_bindgen(js_name = exportEncrypted)]
    pub fn export_encrypted(&self, passphrase: &str) -> Result<Vec<u8>, JsValue> {
        self.inner
            .export_encrypted(passphrase)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = importEncrypted)]
    pub fn import_encrypted(blob: &[u8], passphrase: &str) -> Result<WasmIdentity, JsValue> {
        let inner = CoreIdentity::import_encrypted(blob, passphrase)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(WasmIdentity { inner })
    }

    #[wasm_bindgen(js_name = generatePeerjsId)]
    pub fn generate_peerjs_id(&self) -> String {
        self.inner.generate_peerjs_id()
    }

    #[wasm_bindgen(js_name = safetyNumberWith)]
    pub fn safety_number_with(&self, other_ed_pub: &[u8]) -> Result<String, JsValue> {
        if other_ed_pub.len() != 32 {
            return Err(JsValue::from_str("Invalid public key length"));
        }
        let mut pub_bytes = [0u8; 32];
        pub_bytes.copy_from_slice(other_ed_pub);
        Ok(compute_safety_number(self.inner.ed25519_pub(), &pub_bytes))
    }
}

#[wasm_bindgen]
pub struct WasmHandshakeState {
    inner: CoreHandshakeState,
}

#[wasm_bindgen]
pub struct WasmSession {
    inner: CoreSession,
}

#[wasm_bindgen]
impl WasmSession {
    #[wasm_bindgen(js_name = initiateHandshake)]
    pub fn initiate_handshake(
        identity: &WasmIdentity,
        room_key: Option<Vec<u8>>,
    ) -> Result<JsValue, JsValue> {
        let r_key = match room_key {
            Some(ref k) if k.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(k);
                Some(arr)
            }
            Some(_) => return Err(JsValue::from_str("Invalid room key length")),
            None => None,
        };

        let (_hello_val, state) = CoreSession::initiate_handshake(&identity.inner, r_key.as_ref())
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let state_boxed = Box::new(WasmHandshakeState { inner: state });
        let state_ptr = Box::into_raw(state_boxed) as usize as u32;

        let obj = js_sys::Object::new();
        let hello_js = serde_wasm_bindgen::to_value(&_hello_val)?;
        js_sys::Reflect::set(&obj, &JsValue::from_str("hello"), &hello_js)?;
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("statePtr"),
            &JsValue::from_f64(state_ptr as f64),
        )?;

        Ok(obj.into())
    }

    #[wasm_bindgen(js_name = respondHandshake)]
    pub fn respond_handshake(
        identity: &WasmIdentity,
        remote_hello_js: JsValue,
        room_key: Option<Vec<u8>>,
    ) -> Result<JsValue, JsValue> {
        let remote_hello: Hello = serde_wasm_bindgen::from_value(remote_hello_js)?;
        let r_key = match room_key {
            Some(ref k) if k.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(k);
                Some(arr)
            }
            Some(_) => return Err(JsValue::from_str("Invalid room key length")),
            None => None,
        };

        let (my_hello, session) =
            CoreSession::respond_handshake(&identity.inner, &remote_hello, r_key.as_ref())
                .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let wasm_session = WasmSession { inner: session };
        let session_boxed = Box::new(wasm_session);
        let session_ptr = Box::into_raw(session_boxed) as usize as u32;

        let obj = js_sys::Object::new();
        let hello_js = serde_wasm_bindgen::to_value(&my_hello)?;
        js_sys::Reflect::set(&obj, &JsValue::from_str("hello"), &hello_js)?;
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("sessionPtr"),
            &JsValue::from_f64(session_ptr as f64),
        )?;

        Ok(obj.into())
    }

    #[wasm_bindgen(js_name = completeHandshake)]
    pub fn complete_handshake(
        identity: &WasmIdentity,
        state_ptr: u32,
        responder_hello_js: JsValue,
        room_key: Option<Vec<u8>>,
    ) -> Result<WasmSession, JsValue> {
        let state_boxed = unsafe { Box::from_raw(state_ptr as usize as *mut WasmHandshakeState) };
        let responder_hello: Hello = serde_wasm_bindgen::from_value(responder_hello_js)?;

        let r_key = match room_key {
            Some(ref k) if k.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(k);
                Some(arr)
            }
            Some(_) => return Err(JsValue::from_str("Invalid room key length")),
            None => None,
        };

        let session = CoreSession::complete_handshake(
            &identity.inner,
            state_boxed.inner,
            &responder_hello,
            r_key.as_ref(),
        )
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

        Ok(WasmSession { inner: session })
    }

    #[wasm_bindgen(js_name = fromPointer)]
    pub fn from_pointer(ptr: u32) -> WasmSession {
        let boxed = unsafe { Box::from_raw(ptr as usize as *mut WasmSession) };
        *boxed
    }

    #[wasm_bindgen(js_name = remoteUserId)]
    pub fn remote_user_id(&self) -> String {
        self.inner.remote_user_id.clone()
    }

    #[wasm_bindgen(js_name = remoteEdPub)]
    pub fn remote_ed_pub(&self) -> Vec<u8> {
        self.inner.remote_ed_pub.to_vec()
    }

    #[wasm_bindgen(js_name = remoteXPub)]
    pub fn remote_x_pub(&self) -> Vec<u8> {
        self.inner.remote_x_pub.to_vec()
    }

    #[wasm_bindgen(js_name = sealFrame)]
    pub fn seal_frame(&mut self, frame_js: JsValue) -> Result<Vec<u8>, JsValue> {
        let frame: Frame = serde_wasm_bindgen::from_value(frame_js)?;
        self.inner
            .seal_frame(&frame)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = openFrame)]
    pub fn open_frame(&mut self, ciphertext: &[u8]) -> Result<JsValue, JsValue> {
        let frame = self
            .inner
            .open_frame(ciphertext)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_wasm_bindgen::to_value(&frame).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[wasm_bindgen(js_name = createMessage)]
pub fn create_message(
    identity: &WasmIdentity,
    id: String,
    conversation: String,
    author: String,
    lamport: f64,
    sent_at_ms: f64,
    body_js: JsValue,
) -> Result<JsValue, JsValue> {
    let body: Body = serde_wasm_bindgen::from_value(body_js)?;
    let msg = peerchat_core::create_chat_message(
        &identity.inner.signing_key(),
        id,
        conversation,
        author,
        lamport as u64,
        sent_at_ms as u64,
        body,
    )
    .map_err(|e| JsValue::from_str(&e.to_string()))?;

    serde_wasm_bindgen::to_value(&msg).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen(js_name = verifyMessage)]
pub fn verify_message(msg_js: JsValue, author_pub: &[u8]) -> Result<bool, JsValue> {
    if author_pub.len() != 32 {
        return Err(JsValue::from_str("Invalid public key length"));
    }
    let mut pub_bytes = [0u8; 32];
    pub_bytes.copy_from_slice(author_pub);

    let msg: ChatMessage = serde_wasm_bindgen::from_value(msg_js)?;
    peerchat_core::verify_chat_message(&msg, &pub_bytes)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen(js_name = roomKeyFromSecret)]
pub fn room_key_from_secret(secret: &str) -> Result<Vec<u8>, JsValue> {
    let key = derive_room_key(secret).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(key.to_vec())
}

#[wasm_bindgen(js_name = deriveUserIdFromPub)]
pub fn derive_user_id_from_pub(ed_pub: &[u8]) -> Result<String, JsValue> {
    if ed_pub.len() != 32 {
        return Err(JsValue::from_str("Invalid public key length"));
    }
    let mut pub_bytes = [0u8; 32];
    pub_bytes.copy_from_slice(ed_pub);
    Ok(derive_user_id(&pub_bytes))
}

#[wasm_bindgen]
pub struct WasmFileEncryptor {
    inner: CoreFileEncryptor,
}

#[wasm_bindgen]
impl WasmFileEncryptor {
    #[wasm_bindgen(constructor)]
    pub fn new(file_id: String, name: String, size: f64, mime: String) -> WasmFileEncryptor {
        WasmFileEncryptor {
            inner: CoreFileEncryptor::new(file_id, name, size as u64, mime),
        }
    }

    #[wasm_bindgen(js_name = getManifest)]
    pub fn get_manifest(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.inner.manifest)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = encryptChunk)]
    pub fn encrypt_chunk(&self, chunk_index: u32, plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
        self.inner
            .encrypt_chunk(chunk_index, plaintext)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[wasm_bindgen]
pub struct WasmFileDecryptor {
    inner: CoreFileDecryptor,
}

#[wasm_bindgen]
impl WasmFileDecryptor {
    #[wasm_bindgen(constructor)]
    pub fn new(manifest_js: JsValue) -> Result<WasmFileDecryptor, JsValue> {
        let manifest: FileManifest = serde_wasm_bindgen::from_value(manifest_js)?;
        Ok(WasmFileDecryptor {
            inner: CoreFileDecryptor::new(manifest),
        })
    }

    #[wasm_bindgen(js_name = decryptChunk)]
    pub fn decrypt_chunk(
        &mut self,
        chunk_index: u32,
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, JsValue> {
        self.inner
            .decrypt_chunk(chunk_index, ciphertext)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen(js_name = isComplete)]
    pub fn is_complete(&self) -> bool {
        self.inner.is_complete()
    }
}
