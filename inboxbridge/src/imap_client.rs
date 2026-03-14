use anyhow::{Context, Result};
use async_imap::types::{Capabilities, Fetch, Mailbox};
use async_imap::Session;
use async_native_tls::{TlsConnector, TlsStream};
use async_std::net::TcpStream;
use async_std::stream::StreamExt;
use chrono::Utc;
use std::collections::HashSet;

/// Wraps both TLS and plaintext IMAP sessions behind a uniform interface.
/// Plain (non-TLS) connections are only allowed on loopback -- enforced by
/// the dispatcher before `connect()` is ever called.
///
/// Size difference between variants is acceptable: there is exactly one
/// instance per ImapClient, never stored in collections.
#[allow(clippy::large_enum_variant)]
enum ImapSession {
    Tls(Session<TlsStream<TcpStream>>),
    Plain(Session<TcpStream>),
}

/// Macro to dispatch a method call on the inner session variant.
/// Avoids duplicating every delegate method by hand.
macro_rules! dispatch_session {
    ($self:expr, $method:ident ( $($arg:expr),* )) => {
        match $self {
            ImapSession::Tls(s) => s.$method($($arg),*).await,
            ImapSession::Plain(s) => s.$method($($arg),*).await,
        }
    };
}

impl ImapSession {
    async fn select(&mut self, mailbox: &str) -> async_imap::error::Result<Mailbox> {
        dispatch_session!(self, select(mailbox))
    }

    async fn uid_search(&mut self, query: &str) -> async_imap::error::Result<HashSet<u32>> {
        dispatch_session!(self, uid_search(query))
    }

    /// Fetches by UID set and collects the stream into a Vec.
    /// We collect here because the return type of `Session::uid_fetch` is an
    /// opaque `impl Stream` tied to the concrete session generic -- we cannot
    /// return it through the enum boundary.
    async fn uid_fetch_collect(
        &mut self,
        uid_set: &str,
        query: &str,
    ) -> async_imap::error::Result<Vec<Fetch>> {
        let mut results = Vec::new();
        match self {
            ImapSession::Tls(s) => {
                let mut stream = s.uid_fetch(uid_set, query).await?;
                while let Some(item) = stream.next().await {
                    results.push(item?);
                }
            }
            ImapSession::Plain(s) => {
                let mut stream = s.uid_fetch(uid_set, query).await?;
                while let Some(item) = stream.next().await {
                    results.push(item?);
                }
            }
        }
        Ok(results)
    }

    async fn capabilities(&mut self) -> async_imap::error::Result<Capabilities> {
        dispatch_session!(self, capabilities())
    }

    async fn logout(&mut self) -> async_imap::error::Result<()> {
        dispatch_session!(self, logout())
    }
}

pub struct ImapClient {
    session: Option<ImapSession>,
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
        tls: bool,
    ) -> Result<()> {
        let addr = format!("{}:{}", host, port);
        let tcp_stream = TcpStream::connect(&addr)
            .await
            .context("Failed to connect to IMAP server")?;

        if tls {
            let tls_connector = TlsConnector::new();
            let tls_stream = tls_connector
                .connect(host, tcp_stream)
                .await
                .context("TLS handshake failed")?;

            let client = async_imap::Client::new(tls_stream);
            let session = client
                .login(username, password)
                .await
                .map_err(|e| anyhow::anyhow!("IMAP authentication failed: {:?}", e))?;

            self.session = Some(ImapSession::Tls(session));
        } else {
            let client = async_imap::Client::new(tcp_stream);
            let session = client
                .login(username, password)
                .await
                .map_err(|e| anyhow::anyhow!("IMAP authentication failed: {:?}", e))?;

            self.session = Some(ImapSession::Plain(session));
        }

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

    pub async fn list_recent(
        &mut self,
        since_minutes: u32,
        limit: usize,
    ) -> Result<Vec<EmailMessage>> {
        let session = self.session.as_mut()
            .context("Not connected to IMAP server")?;

        session.select("INBOX").await?;

        // SINCE is day-granular (IMAP RFC 3501 limitation) -- we post-filter below
        let since_date = Utc::now() - chrono::Duration::minutes(since_minutes as i64);
        let date_str = since_date.format("%d-%b-%Y").to_string();
        let query = format!("SINCE {}", date_str);

        // FIX 1: uid_search returns UIDs; the old `search` returned sequence numbers
        //        which were then incorrectly passed to uid_fetch.
        let uids = session.uid_search(&query).await?;

        // FIX 2: Sort UIDs descending (higher UID = newer message) so we fetch
        //        the newest messages first instead of arbitrary HashSet order.
        let mut uid_vec: Vec<u32> = uids.into_iter().collect();
        uid_vec.sort_unstable_by(|a, b| b.cmp(a));

        let mut messages = Vec::new();
        let cutoff_ms = since_date.timestamp_millis();

        // Fetch more than `limit` to account for post-filter dropping older
        // same-day messages, but cap to avoid fetching thousands.
        let fetch_limit = (limit * 2).min(50);

        for uid in uid_vec.iter().take(fetch_limit) {
            let fetched = session
                .uid_fetch_collect(
                    &uid.to_string(),
                    "(ENVELOPE BODY.PEEK[TEXT]<0.2000>)",
                )
                .await?;

            for msg in &fetched {
                if let Some(envelope) = msg.envelope() {
                    let from = envelope.from.as_ref()
                        .and_then(|addrs| addrs.first())
                        .and_then(|addr| {
                            addr.mailbox.as_ref().and_then(|m| {
                                addr.host.as_ref().map(|h| {
                                    format!(
                                        "{}@{}",
                                        String::from_utf8_lossy(m),
                                        String::from_utf8_lossy(h)
                                    )
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

                    // FIX 3: Post-filter by actual timestamp.
                    // IMAP SINCE is day-granular, so without this we'd include all
                    // messages from "today" even if they're hours old and the caller
                    // only asked for the last 10 minutes.
                    let parsed_date = chrono::DateTime::parse_from_rfc2822(&date)
                        .or_else(|_| {
                            chrono::DateTime::parse_from_str(
                                &date,
                                "%a, %d %b %Y %H:%M:%S %z",
                            )
                        })
                        .ok();

                    if let Some(dt) = parsed_date {
                        if dt.timestamp_millis() < cutoff_ms {
                            continue; // Older than the requested window
                        }
                    }
                    // If date can't be parsed, include the message -- better to
                    // over-include than miss a verification code.

                    let snippet = msg.text()
                        .map(|b| {
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

                    if messages.len() >= limit {
                        break;
                    }
                }
            }

            if messages.len() >= limit {
                break;
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

    #[test]
    fn test_imap_session_variants_exist() {
        // Verify the enum has both variants (compile-time check).
        // We cannot construct real sessions without a server, so just ensure
        // the types are well-formed.
        fn _assert_send<T: Send>() {}
        // ImapClient itself should be Send for use across async tasks
        _assert_send::<ImapClient>();
    }

    // Note: Integration tests with real IMAP servers should be manual
    // or use a mock IMAP server in CI
}
