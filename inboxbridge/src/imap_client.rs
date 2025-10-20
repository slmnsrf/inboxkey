use anyhow::{Context, Result};
use async_imap::Session;
use async_native_tls::{TlsConnector, TlsStream};
use async_std::net::TcpStream;
use async_std::stream::StreamExt;
use chrono::Utc;

pub struct ImapClient {
    session: Option<Session<TlsStream<TcpStream>>>,
}

impl ImapClient {
    pub fn new() -> Self {
        Self { session: None }
    }

    pub async fn connect(
        &mut self,
        host: &str,
        port: u16,
        username: &str,
        password: &str,
    ) -> Result<()> {
        let addr = format!("{}:{}", host, port);
        let tcp_stream = TcpStream::connect(&addr)
            .await
            .context("Failed to connect to IMAP server")?;

        let tls = TlsConnector::new();
        let tls_stream = tls
            .connect(host, tcp_stream)
            .await
            .context("TLS handshake failed")?;

        let client = async_imap::Client::new(tls_stream);

        let session = client
            .login(username, password)
            .await
            .map_err(|e| anyhow::anyhow!("IMAP authentication failed: {:?}", e))?;

        self.session = Some(session);
        Ok(())
    }

    pub async fn test_connection(&mut self) -> Result<(bool, Option<u64>)> {
        let session = self.session.as_mut()
            .context("Not connected to IMAP server")?;

        let start = std::time::Instant::now();

        // Simple capability check to verify connection
        let _capabilities = session.capabilities().await?;

        let elapsed = start.elapsed();
        let round_trip_ms = elapsed.as_millis() as u64;

        Ok((true, Some(round_trip_ms)))
    }

    pub async fn list_recent(&mut self, since_minutes: u32, limit: usize) -> Result<Vec<EmailMessage>> {
        let session = self.session.as_mut()
            .context("Not connected to IMAP server")?;

        session.select("INBOX").await?;

        let since_date = Utc::now() - chrono::Duration::minutes(since_minutes as i64);
        let date_str = since_date.format("%d-%b-%Y").to_string();

        let query = format!("SINCE {}", date_str);
        let uids = session.search(&query).await?;

        let mut messages = Vec::new();

        // Limit to requested number of messages
        for uid in uids.iter().take(limit) {
            let mut fetch_stream = session
                .uid_fetch(uid.to_string(), "(ENVELOPE BODY.PEEK[TEXT]<0.2000>)")
                .await?;

            while let Some(fetch_result) = fetch_stream.next().await {
                let msg = fetch_result?;

                if let Some(envelope) = msg.envelope() {
                    let from = envelope.from.as_ref()
                        .and_then(|addrs| addrs.first())
                        .and_then(|addr| {
                            addr.mailbox.as_ref().and_then(|m| {
                                addr.host.as_ref().map(|h| {
                                    format!("{}@{}",
                                        String::from_utf8_lossy(m),
                                        String::from_utf8_lossy(h))
                                })
                            })
                        })
                        .unwrap_or_default();

                    let subject = envelope.subject.as_ref()
                        .map(|s| String::from_utf8_lossy(s).to_string())
                        .unwrap_or_default();

                    let date = envelope.date.as_ref()
                        .map(|d| String::from_utf8_lossy(d).to_string())
                        .unwrap_or_else(|| Utc::now().to_rfc3339());

                    let snippet = msg.text()
                        .map(|b| {
                            // Take first 200 characters, ensure valid UTF-8
                            String::from_utf8_lossy(b)
                                .chars()
                                .take(200)
                                .collect()
                        })
                        .unwrap_or_default();

                    messages.push(EmailMessage {
                        uid: *uid,
                        date,
                        from,
                        subject,
                        snippet,
                    });
                }
            }
        }

        Ok(messages)
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        if let Some(mut session) = self.session.take() {
            session.logout().await?;
        }
        Ok(())
    }
}

#[derive(Debug, serde::Serialize)]
pub struct EmailMessage {
    pub uid: u32,
    pub date: String,
    pub from: String,
    pub subject: String,
    pub snippet: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_client_creation() {
        let client = ImapClient::new();
        assert!(client.session.is_none());
    }

    // Note: Integration tests with real IMAP servers should be manual
    // or use a mock IMAP server in CI
}
