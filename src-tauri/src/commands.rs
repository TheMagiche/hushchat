use peerchat_core::{compute_safety_number, derive_user_id};

#[tauri::command]
pub fn get_version() -> String {
    "0.1.0".into()
}

#[tauri::command]
pub fn derive_user_id_cmd(ed25519_pub: Vec<u8>) -> Result<String, String> {
    if ed25519_pub.len() != 32 {
        return Err("Invalid public key length (expected 32 bytes)".into());
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&ed25519_pub);
    Ok(derive_user_id(&arr))
}

#[tauri::command]
pub fn safety_number_cmd(pub1: Vec<u8>, pub2: Vec<u8>) -> Result<String, String> {
    if pub1.len() != 32 || pub2.len() != 32 {
        return Err("Invalid public key lengths".into());
    }
    let mut arr1 = [0u8; 32];
    arr1.copy_from_slice(&pub1);
    let mut arr2 = [0u8; 32];
    arr2.copy_from_slice(&pub2);
    Ok(compute_safety_number(&arr1, &arr2))
}
