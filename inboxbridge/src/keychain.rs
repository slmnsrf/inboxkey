use anyhow::Result;
use keyring::Entry;

pub struct KeychainManager;

impl KeychainManager {
    pub fn new() -> Self {
        Self
    }

    pub fn store_password(&self, service: &str, account: &str, password: &str) -> Result<()> {
        let entry = Entry::new(service, account)?;
        entry.set_password(password)?;
        Ok(())
    }

    pub fn get_password(&self, service: &str, account: &str) -> Result<String> {
        let entry = Entry::new(service, account)?;
        let password = entry.get_password()?;
        Ok(password)
    }

    pub fn delete_password(&self, service: &str, account: &str) -> Result<()> {
        let entry = Entry::new(service, account)?;
        entry.delete_password()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg_attr(all(target_os = "linux", not(feature = "test-keychain")), ignore)]
    fn test_keychain_roundtrip() {
        let manager = KeychainManager::new();
        let service = "com.inboxkey.bridge.test";
        let account = "test@example.com";
        let password = "test-password-123";

        // Store - skip test if keychain is unavailable
        if let Err(e) = manager.store_password(service, account, password) {
            eprintln!("Keychain not available (expected in test environments): {}", e);
            return;
        }

        // Retrieve
        let retrieved = manager.get_password(service, account).unwrap();
        assert_eq!(retrieved, password);

        // Delete
        manager.delete_password(service, account).unwrap();
    }
}
