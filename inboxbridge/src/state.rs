use serde::{Serialize, Deserialize};
use fs2::FileExt;
use std::path::PathBuf;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub tls: bool,
    pub username: String,
}

pub struct AppState {
    storage_dir: PathBuf,
}

impl AppState {
    pub fn new(custom_dir: Option<PathBuf>) -> Self {
        let dir = custom_dir.unwrap_or_else(Self::default_storage_dir);
        std::fs::create_dir_all(&dir).ok();

        let state = Self { storage_dir: dir };

        // Startup corruption check under exclusive lock.
        if let Ok(lock_file) = state.open_lock_file() {
            if lock_file.lock_exclusive().is_ok() {
                let data_path = state.data_path();
                if data_path.exists() {
                    if let Ok(json) = std::fs::read_to_string(&data_path) {
                        if Self::try_parse(&json).is_none() {
                            state.repair_corrupt_file();
                        }
                    }
                }
            }
        }

        state
    }

    fn default_storage_dir() -> PathBuf {
        let base = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."));
        if cfg!(target_os = "linux") {
            base.join("inboxbridge")
        } else {
            base.join("InboxBridge")
        }
    }

    fn data_path(&self) -> PathBuf {
        self.storage_dir.join("accounts.json")
    }

    fn lock_path(&self) -> PathBuf {
        self.storage_dir.join("accounts.lock")
    }

    fn open_lock_file(&self) -> Result<std::fs::File, String> {
        std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.lock_path())
            .map_err(|e| format!("Failed to open lock file: {}", e))
    }

    fn try_parse(json: &str) -> Option<HashMap<String, Account>> {
        serde_json::from_str(json).ok()
    }

    fn repair_corrupt_file(&self) {
        let data_path = self.data_path();
        let backup = data_path.with_extension("json.bak");
        std::fs::copy(&data_path, &backup).ok();
        std::fs::remove_file(&data_path).ok();
        eprintln!(
            "WARNING: accounts.json corrupt. Backed up to {:?}. \
             Re-add accounts in Settings to recover.",
            backup
        );
    }

    fn read_accounts(&self) -> Result<HashMap<String, Account>, String> {
        let lock_file = self.open_lock_file()?;
        lock_file.lock_shared()
            .map_err(|e| format!("Failed to acquire shared lock: {}", e))?;

        let data_path = self.data_path();
        if !data_path.exists() {
            return Ok(HashMap::new());
        }

        let json = std::fs::read_to_string(&data_path)
            .map_err(|e| format!("Failed to read accounts: {}", e))?;

        if let Some(accounts) = Self::try_parse(&json) {
            return Ok(accounts);
        }

        // Parse failed: upgrade to exclusive lock to repair.
        lock_file.unlock()
            .map_err(|e| format!("Failed to release shared lock: {}", e))?;
        lock_file.lock_exclusive()
            .map_err(|e| format!("Failed to acquire exclusive lock for repair: {}", e))?;

        // Re-check after acquiring exclusive lock
        if data_path.exists() {
            if let Ok(json2) = std::fs::read_to_string(&data_path) {
                if let Some(accounts) = Self::try_parse(&json2) {
                    return Ok(accounts);
                }
            }
            self.repair_corrupt_file();
        }

        Ok(HashMap::new())
    }

    fn read_modify_write<F>(&self, mutation_fn: F) -> Result<(), String>
    where
        F: FnOnce(&mut HashMap<String, Account>),
    {
        let data_path = self.data_path();

        let lock_file = self.open_lock_file()?;
        lock_file.lock_exclusive()
            .map_err(|e| format!("Failed to acquire exclusive lock: {}", e))?;

        let mut accounts: HashMap<String, Account> = if data_path.exists() {
            let json = std::fs::read_to_string(&data_path)
                .map_err(|e| format!("Failed to read accounts: {}", e))?;
            match Self::try_parse(&json) {
                Some(accts) => accts,
                None => {
                    self.repair_corrupt_file();
                    HashMap::new()
                }
            }
        } else {
            HashMap::new()
        };

        mutation_fn(&mut accounts);

        let json = serde_json::to_string_pretty(&accounts)
            .map_err(|e| format!("Serialization failed: {}", e))?;
        std::fs::write(&data_path, &json)
            .map_err(|e| format!("Failed to write accounts: {}", e))?;

        Ok(())
    }

    pub fn get_account(&self, id: &str) -> Result<Option<Account>, String> {
        let accounts = self.read_accounts()?;
        Ok(accounts.get(id).cloned())
    }

    pub fn list_accounts(&self) -> Result<Vec<Account>, String> {
        let accounts = self.read_accounts()?;
        Ok(accounts.into_values().collect())
    }

    pub fn add_account(&self, account: Account) -> Result<String, String> {
        let id = account.id.clone();
        self.read_modify_write(|accounts| {
            accounts.insert(account.id.clone(), account);
        })?;
        Ok(id)
    }

    pub fn remove_account(&self, id: &str) -> Result<bool, String> {
        let mut removed = false;
        let id_owned = id.to_string();
        self.read_modify_write(|accounts| {
            removed = accounts.remove(&id_owned).is_some();
        })?;
        Ok(removed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn test_dir() -> PathBuf {
        std::env::temp_dir().join(format!("inboxbridge_test_{}", Uuid::new_v4()))
    }

    fn make_account(id: &str) -> Account {
        Account {
            id: id.to_string(),
            label: format!("Test {}", id),
            host: "imap.example.com".to_string(),
            port: 993,
            tls: true,
            username: format!("{}@example.com", id),
        }
    }

    #[test]
    fn test_account_lifecycle() {
        let dir = test_dir();
        let state = AppState::new(Some(dir.clone()));

        let account = make_account("acc_lifecycle");

        // Add account
        let id = state.add_account(account).unwrap();
        assert_eq!(id, "acc_lifecycle");

        // Get account
        let retrieved = state.get_account(&id).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().label, "Test acc_lifecycle");

        // Remove account
        let removed = state.remove_account(&id).unwrap();
        assert!(removed);

        // Verify gone
        let retrieved = state.get_account(&id).unwrap();
        assert!(retrieved.is_none());

        // Cleanup
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_persistence_roundtrip() {
        let dir = test_dir();

        // AppState A writes an account
        let state_a = AppState::new(Some(dir.clone()));
        state_a.add_account(make_account("acc_persist")).unwrap();

        // AppState B (same dir) should see it
        let state_b = AppState::new(Some(dir.clone()));
        let retrieved = state_b.get_account("acc_persist").unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().username, "acc_persist@example.com");

        // Cleanup
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_cross_process_write_safety() {
        let dir = test_dir();

        let state_a = AppState::new(Some(dir.clone()));
        let state_b = AppState::new(Some(dir.clone()));

        // A adds X
        state_a.add_account(make_account("acc_x")).unwrap();

        // B adds Y
        state_b.add_account(make_account("acc_y")).unwrap();

        // Both visible from either instance
        let list_a = state_a.list_accounts().unwrap();
        let list_b = state_b.list_accounts().unwrap();

        assert_eq!(list_a.len(), 2);
        assert_eq!(list_b.len(), 2);

        let ids_a: Vec<String> = list_a.iter().map(|a| a.id.clone()).collect();
        assert!(ids_a.contains(&"acc_x".to_string()));
        assert!(ids_a.contains(&"acc_y".to_string()));

        // Cleanup
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_corrupt_file_recovery() {
        let dir = test_dir();
        std::fs::create_dir_all(&dir).unwrap();

        // Write garbage to accounts.json
        let data_path = dir.join("accounts.json");
        std::fs::write(&data_path, "THIS IS NOT JSON {{{garbage").unwrap();

        // Create AppState -- startup should detect and repair
        let state = AppState::new(Some(dir.clone()));

        // .bak should exist
        let bak_path = dir.join("accounts.json.bak");
        assert!(bak_path.exists(), "Backup file should be created");

        // Corrupt file should be removed
        assert!(!data_path.exists(), "Corrupt file should be deleted");

        // list_accounts returns empty
        let list = state.list_accounts().unwrap();
        assert!(list.is_empty());

        // Can still add accounts after recovery
        state.add_account(make_account("acc_recovered")).unwrap();
        let retrieved = state.get_account("acc_recovered").unwrap();
        assert!(retrieved.is_some());

        // Cleanup
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_empty_dir_first_run() {
        let dir = test_dir();
        let state = AppState::new(Some(dir.clone()));

        // Empty list on first run
        let list = state.list_accounts().unwrap();
        assert!(list.is_empty());

        // Add account
        state.add_account(make_account("acc_first")).unwrap();

        // File should now exist
        let data_path = dir.join("accounts.json");
        assert!(data_path.exists(), "accounts.json should be created after first add");

        // Account retrievable
        let retrieved = state.get_account("acc_first").unwrap();
        assert!(retrieved.is_some());

        // Cleanup
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_read_path_repairs_corruption() {
        let dir = test_dir();
        let state = AppState::new(Some(dir.clone()));

        // Add a valid account
        state.add_account(make_account("acc_will_corrupt")).unwrap();
        let retrieved = state.get_account("acc_will_corrupt").unwrap();
        assert!(retrieved.is_some());

        // Overwrite accounts.json with garbage ON THE SAME INSTANCE
        let data_path = dir.join("accounts.json");
        std::fs::write(&data_path, "CORRUPTED DATA!!!").unwrap();

        // list_accounts should detect corruption and repair
        let list = state.list_accounts().unwrap();
        assert!(list.is_empty(), "Should return empty after corruption repair");

        // .bak should exist
        let bak_path = dir.join("accounts.json.bak");
        assert!(bak_path.exists(), "Backup should be created during read-path repair");

        // Corrupt file should be gone
        assert!(!data_path.exists(), "Corrupt file should be deleted");

        // Recovery works -- can add new account
        state.add_account(make_account("acc_after_repair")).unwrap();
        let retrieved = state.get_account("acc_after_repair").unwrap();
        assert!(retrieved.is_some());

        // Cleanup
        std::fs::remove_dir_all(&dir).ok();
    }
}
