use anyhow::{Context, Result};
use async_imap::types::{Capabilities, Fetch, Mailbox};
use async_imap::Session;
use async_native_tls::{TlsConnector, TlsStream};
use async_std::net::TcpStream;
use async_std::stream::StreamExt;
use chrono::Utc;
use mail_parser::MessageParser;
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

/// Head-of-message slice we ask the IMAP server for. Verification emails are
/// almost always under 50 KB; 64 KiB covers headers + body + a buffer without
/// pulling attachments. Chrome's native-messaging response cap is 1 MB total
/// (see dispatcher's response budget guard), so per-message size matters.
const FETCH_HEAD_BYTES: u32 = 65536;

/// Cap on each decoded body field (text, html) returned over the wire.
/// Verification codes live in the first few hundred bytes of body text;
/// 32 KiB is plenty for the extractor and bounds wire-size growth even
/// when both text and html parts are present.
const BODY_FIELD_MAX_CHARS: usize = 32 * 1024;

/// Decoded plaintext preview length kept for backward-compat with old
/// extension clients that read `snippet`. ~500 chars is enough for the
/// extractor's eye but cheap on the wire.
const SNIPPET_MAX_CHARS: usize = 500;

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

        // FETCH query: drop ENVELOPE entirely. The full RFC822 head slice
        // contains the headers; mail-parser decodes RFC2047 subject + From
        // and per-part Content-Transfer-Encoding (base64, quoted-printable).
        // Saves the envelope bytes on every message and gives one consistent
        // decode path. INTERNALDATE stays for accurate receive-time post-filter.
        let fetch_query = format!(
            "(UID INTERNALDATE BODY.PEEK[]<0.{}>)",
            FETCH_HEAD_BYTES
        );

        // Batch all candidate UIDs into a single FETCH. The old code looped
        // one UID at a time which paid an IMAP round-trip per message; with
        // 50 candidates over a 50ms link that was 2.5s of pure RTT before
        // any parsing started. A batched FETCH costs the same one RTT for
        // any number of UIDs in the set.
        let uids_to_fetch: Vec<u32> = uid_vec.iter().take(fetch_limit).copied().collect();
        if uids_to_fetch.is_empty() {
            return Ok(messages);
        }
        let uid_set = uids_to_fetch
            .iter()
            .map(|u| u.to_string())
            .collect::<Vec<_>>()
            .join(",");

        let fetched = session.uid_fetch_collect(&uid_set, &fetch_query).await?;

        // The IMAP RFC does not strictly guarantee response order for batched
        // FETCH, so we collect into (uid, EmailMessage) and re-sort by UID
        // descending (newest-first) ourselves before applying `limit`. That
        // also keeps callers' assumption "results[0] is the most recent" true
        // regardless of server quirks.
        let mut decoded: Vec<EmailMessage> = Vec::with_capacity(fetched.len());

        for msg in &fetched {
            // FIX 3: Post-filter by INTERNALDATE (server receive time).
            // IMAP SINCE is day-granular, so without this we'd include all
            // messages from "today" even if they're hours old and the caller
            // only asked for the last 10 minutes.
            let internal_date = msg.internal_date();
            if let Some(d) = internal_date {
                if d.timestamp_millis() < cutoff_ms {
                    continue; // Older than the requested window
                }
            }
            // If INTERNALDATE is missing, include the message -- better to
            // over-include than miss a verification code.

            // The server tells us the UID in the FETCH response; fall back
            // to 0 only if it's somehow missing (server bug). The dispatcher
            // doesn't filter on uid==0 so this just produces a degraded but
            // non-fatal record.
            let uid = msg.uid.unwrap_or(0);

            let date_str = internal_date
                .map(|d| d.to_rfc3339())
                .unwrap_or_else(|| Utc::now().to_rfc3339());

            let raw = msg.body().unwrap_or(&[]);
            decoded.push(parse_message_bytes(raw, uid, &date_str));
        }

        // Sort newest-first and apply caller's limit.
        decoded.sort_unstable_by(|a, b| b.uid.cmp(&a.uid));
        decoded.truncate(limit);
        messages = decoded;

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
    /// Decoded plaintext preview (~SNIPPET_MAX_CHARS). Kept for backward
    /// compatibility with extension versions that pre-date the text/html split.
    pub snippet: String,
    /// Decoded text/plain body part, truncated to BODY_FIELD_MAX_CHARS chars.
    /// `None` only when no usable text body can be derived -- mail-parser
    /// auto-synthesizes text from html when the message is html-only, so a
    /// text-less record is rare in practice.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Decoded text/html body part, truncated to BODY_FIELD_MAX_CHARS chars.
    /// `None` only when no usable html body can be derived -- mail-parser
    /// auto-synthesizes html from text when the message is text-only, so an
    /// html-less record is rare in practice.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
}

/// Parse a raw RFC822 byte slice (which may be the head-of-message partial
/// fetch result, so it can be truncated mid-body) and return the wire-shape
/// `EmailMessage`. Falls back to safe empty strings if parsing fails -- we
/// never want to break the polling loop because one message had odd MIME.
fn parse_message_bytes(raw: &[u8], uid: u32, date: &str) -> EmailMessage {
    let parser = MessageParser::default();
    let parsed = parser.parse(raw);

    if let Some(message) = parsed {
        let subject = message
            .subject()
            .map(|s| truncate_chars(s, BODY_FIELD_MAX_CHARS))
            .unwrap_or_default();

        let from = first_from_email(&message);

        let text_body = message
            .body_text(0)
            .map(|t| truncate_chars(t.as_ref(), BODY_FIELD_MAX_CHARS));
        let html_body = message
            .body_html(0)
            .map(|h| truncate_chars(h.as_ref(), BODY_FIELD_MAX_CHARS));

        // Snippet: prefer text body. Fall back to html with tags stripped if
        // there is no text part. This mirrors what the extension extractor
        // does internally and gives old (snippet-only) clients useful content.
        let snippet = match (text_body.as_deref(), html_body.as_deref()) {
            (Some(t), _) => truncate_chars(t, SNIPPET_MAX_CHARS),
            (None, Some(h)) => truncate_chars(&strip_html_tags(h), SNIPPET_MAX_CHARS),
            (None, None) => String::new(),
        };

        EmailMessage {
            uid,
            date: date.to_string(),
            from,
            subject,
            snippet,
            text: text_body,
            html: html_body,
        }
    } else {
        // mail-parser returns None only on structurally fatal input. Surface
        // an empty record so the polling loop keeps moving rather than
        // erroring out the whole batch for one malformed message.
        EmailMessage {
            uid,
            date: date.to_string(),
            from: String::new(),
            subject: String::new(),
            snippet: String::new(),
            text: None,
            html: None,
        }
    }
}

/// Pull the first email address out of the From header. mail-parser hands
/// back a structured Address; we want the bare `user@host` string the
/// extension already expects in its EmailLike.from field.
fn first_from_email(message: &mail_parser::Message<'_>) -> String {
    if let Some(addr) = message.from() {
        if let Some(first) = addr.first() {
            if let Some(email) = first.address() {
                return email.to_string();
            }
        }
    }
    String::new()
}

/// Truncate to at most `max_chars` Unicode characters. Counting chars (not
/// bytes) keeps us from splitting a multi-byte UTF-8 sequence and producing
/// invalid UTF-8 over the JSON wire.
fn truncate_chars(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        s.chars().take(max_chars).collect()
    }
}

/// Naive tag stripper used only when building a snippet from html-only
/// messages. Produces a usable preview; the html field itself is preserved
/// so downstream extractors can run their own real HTML parsing.
fn strip_html_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
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

    #[test]
    fn truncate_chars_preserves_short_strings() {
        assert_eq!(truncate_chars("hello", 10), "hello");
    }

    #[test]
    fn truncate_chars_caps_long_strings() {
        let s = "abcdefghij";
        assert_eq!(truncate_chars(s, 5), "abcde");
    }

    #[test]
    fn truncate_chars_handles_multi_byte_safely() {
        // German umlaut is 2 bytes in UTF-8. Splitting by bytes would corrupt;
        // splitting by chars must preserve the full grapheme.
        let s = "Fügen";
        let out = truncate_chars(s, 3);
        assert_eq!(out, "Füg");
        assert!(out.is_char_boundary(out.len()));
    }

    #[test]
    fn strip_html_tags_keeps_text_content() {
        assert_eq!(
            strip_html_tags("<p>Hello <b>world</b></p>"),
            "Hello world"
        );
    }

    // ---- MIME parsing fixtures -----------------------------------------
    //
    // These exercise the contract that mattered for v1.1.4:
    // verification-code emails arrive in many MIME shapes (multipart with
    // base64 or quoted-printable, RFC2047 encoded subjects, text-only,
    // html-only) and the bridge has to hand back DECODED bodies so the
    // extension's extractor can find the code. Truncation case proves the
    // 64 KiB head slice doesn't poison the parser when MIME ends mid-stream.

    fn parse(raw: &[u8]) -> EmailMessage {
        parse_message_bytes(raw, 42, "2026-05-04T00:00:00Z")
    }

    #[test]
    fn parses_multipart_alternative_with_base64_text() {
        // Decoded payload: "Your code is 123456"
        let raw = b"\
From: sender@example.com\r\n\
To: receiver@example.com\r\n\
Subject: Verify\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/alternative; boundary=\"BOUND\"\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
WW91ciBjb2RlIGlzIDEyMzQ1Ng==\r\n\
--BOUND\r\n\
Content-Type: text/html; charset=utf-8\r\n\
\r\n\
<p>Your code is 123456</p>\r\n\
--BOUND--\r\n";
        let m = parse(raw);
        assert_eq!(m.from, "sender@example.com");
        assert_eq!(m.subject, "Verify");
        assert_eq!(m.text.as_deref(), Some("Your code is 123456"));
        assert!(m.html.as_deref().unwrap_or("").contains("Your code is 123456"));
        assert!(m.snippet.contains("Your code is 123456"));
    }

    #[test]
    fn parses_multipart_alternative_with_quoted_printable() {
        // Quoted-printable: =C3=BC -> ü, =C3=96 -> Ö
        let raw = b"\
From: sender@example.com\r\n\
Subject: QP\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/alternative; boundary=\"BOUND\"\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
Content-Transfer-Encoding: quoted-printable\r\n\
\r\n\
F=C3=BCgen Sie Semih =C3=96zdemir hinzu.\r\n\
--BOUND--\r\n";
        let m = parse(raw);
        assert_eq!(m.text.as_deref(), Some("Fügen Sie Semih Özdemir hinzu."));
    }

    #[test]
    fn decodes_rfc2047_q_encoded_subject() {
        let raw = b"\
From: sender@example.com\r\n\
Subject: =?UTF-8?Q?F=C3=BCgen_Sie_Semih_=C3=96zdemir_hinzu?=\r\n\
\r\n\
body\r\n";
        let m = parse(raw);
        assert_eq!(m.subject, "Fügen Sie Semih Özdemir hinzu");
    }

    #[test]
    fn decodes_rfc2047_b_encoded_subject() {
        // base64("Verify your account") = "VmVyaWZ5IHlvdXIgYWNjb3VudA=="
        let raw = b"\
From: sender@example.com\r\n\
Subject: =?UTF-8?B?VmVyaWZ5IHlvdXIgYWNjb3VudA==?=\r\n\
\r\n\
body\r\n";
        let m = parse(raw);
        assert_eq!(m.subject, "Verify your account");
    }

    #[test]
    fn handles_text_only_message() {
        // mail-parser auto-generates the missing alternative per RFC 8621,
        // so an html field is also present (synthesized from text). Both
        // fields contain the verification content -- this is desirable: the
        // extractor can fall back to either side.
        let raw = b"\
From: sender@example.com\r\n\
Subject: Plain\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
Your code is 999111.\r\n";
        let m = parse(raw);
        assert_eq!(m.text.as_deref(), Some("Your code is 999111.\r\n"));
        assert!(
            m.html.as_deref().unwrap_or("").contains("999111"),
            "auto-generated html should still carry the code"
        );
    }

    #[test]
    fn handles_html_only_message() {
        // Same RFC 8621 auto-conversion: an html-only message yields a
        // synthesized text body too. The original html is preserved on
        // the html field; text is a tag-stripped form ready for the
        // extractor.
        let raw = b"\
From: sender@example.com\r\n\
Subject: HTML\r\n\
Content-Type: text/html; charset=utf-8\r\n\
\r\n\
<p>Your code is <b>777222</b></p>\r\n";
        let m = parse(raw);
        assert!(m.html.as_deref().unwrap_or("").contains("<b>777222</b>"));
        // Auto-generated text strips tags so the extractor sees clean content.
        let text = m.text.as_deref().unwrap_or("");
        assert!(text.contains("777222"));
        assert!(!text.contains("<p>"));
        // Snippet (derived from text) is also clean.
        assert!(m.snippet.contains("777222"));
        assert!(!m.snippet.contains("<p>"));
    }

    #[test]
    fn handles_truncated_multipart_gracefully() {
        // Body cuts off mid-base64 with no closing boundary. mail-parser
        // is best-effort; we just need NOT to panic and to produce some
        // sensible record so the polling loop doesn't crash.
        let raw = b"\
From: sender@example.com\r\n\
Subject: Truncated\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/alternative; boundary=\"BOUND\"\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
WW91ciBjb2";
        let m = parse(raw);
        // We don't assert text content (truncated) -- only that we got
        // through without panicking and recovered the headers.
        assert_eq!(m.subject, "Truncated");
        assert_eq!(m.from, "sender@example.com");
    }

    #[test]
    fn truncates_oversized_body_to_field_cap() {
        // Synthesize a text part well beyond BODY_FIELD_MAX_CHARS.
        let big = "A".repeat(BODY_FIELD_MAX_CHARS + 5_000);
        let raw = format!(
            "From: sender@example.com\r\n\
Subject: Big\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
{}\r\n",
            big
        );
        let m = parse(raw.as_bytes());
        let text = m.text.expect("body should be present");
        assert_eq!(text.chars().count(), BODY_FIELD_MAX_CHARS);
    }

    #[test]
    fn missing_from_header_yields_empty_string() {
        let raw = b"\
Subject: No From\r\n\
\r\n\
hi\r\n";
        let m = parse(raw);
        assert_eq!(m.from, "");
    }

    #[test]
    fn malformed_input_returns_empty_record_without_panic() {
        // Pure garbage -- mail-parser may or may not return Some; either way
        // we just want a non-panicking record with the correct uid/date.
        let raw = b"\x00\x01\x02not really an email\xff\xfe";
        let m = parse(raw);
        assert_eq!(m.uid, 42);
        assert_eq!(m.date, "2026-05-04T00:00:00Z");
    }
}
