use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct Account {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub tls: bool,
    pub username: String,
    // Password stored in keychain, not here
}

#[derive(Clone, Debug)]
pub struct Watch {
    pub id: String,
    pub account_id: String,
    pub since_minutes: u32,
}

pub struct AppState {
    accounts: Arc<RwLock<HashMap<String, Account>>>,
    watches: Arc<RwLock<HashMap<String, Watch>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            accounts: Arc::new(RwLock::new(HashMap::new())),
            watches: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn add_account(&self, account: Account) -> String {
        let id = account.id.clone();
        self.accounts.write().await.insert(id.clone(), account);
        id
    }

    pub async fn get_account(&self, id: &str) -> Option<Account> {
        self.accounts.read().await.get(id).cloned()
    }

    pub async fn remove_account(&self, id: &str) -> bool {
        self.accounts.write().await.remove(id).is_some()
    }

    pub async fn list_accounts(&self) -> Vec<Account> {
        self.accounts.read().await.values().cloned().collect()
    }

    pub async fn add_watch(&self, watch: Watch) -> String {
        let id = watch.id.clone();
        self.watches.write().await.insert(id.clone(), watch);
        id
    }

    pub async fn get_watch(&self, id: &str) -> Option<Watch> {
        self.watches.read().await.get(id).cloned()
    }

    pub async fn remove_watch(&self, id: &str) -> bool {
        self.watches.write().await.remove(id).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_account_lifecycle() {
        let state = AppState::new();

        let account = Account {
            id: "acc_test123".to_string(),
            label: "Test Account".to_string(),
            host: "imap.example.com".to_string(),
            port: 993,
            tls: true,
            username: "test@example.com".to_string(),
        };

        // Add account
        let account_id = state.add_account(account.clone()).await;
        assert_eq!(account_id, "acc_test123");

        // Get account
        let retrieved = state.get_account(&account_id).await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().label, "Test Account");

        // Remove account
        let removed = state.remove_account(&account_id).await;
        assert!(removed);

        // Verify removed
        let retrieved = state.get_account(&account_id).await;
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_watch_lifecycle() {
        let state = AppState::new();

        let watch = Watch {
            id: "watch_test123".to_string(),
            account_id: "acc_test".to_string(),
            since_minutes: 10,
        };

        // Add watch
        let watch_id = state.add_watch(watch.clone()).await;
        assert_eq!(watch_id, "watch_test123");

        // Get watch
        let retrieved = state.get_watch(&watch_id).await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().since_minutes, 10);

        // Remove watch
        let removed = state.remove_watch(&watch_id).await;
        assert!(removed);

        // Verify removed
        let retrieved = state.get_watch(&watch_id).await;
        assert!(retrieved.is_none());
    }
}
