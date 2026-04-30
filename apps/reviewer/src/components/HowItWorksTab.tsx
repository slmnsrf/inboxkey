/**
 * How It Works Tab - Documentation
 * Day 5 Implementation
 */

import React from 'react'

export default function HowItWorksTab() {
  return (
    <div className="how-it-works" style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '24px',
      lineHeight: '1.6',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ borderBottom: '2px solid #1976d2', paddingBottom: '12px' }}>
        InboxKey Reviewer - Developer Tool
      </h1>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#1976d2', marginTop: '32px' }}>What This Tool Does</h2>
        <p>
          InboxKey Reviewer is a developer tool for labeling email batches to improve the
          extraction algorithm. It allows you to:
        </p>
        <ul style={{ marginLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>Connect Gmail/Outlook accounts via OAuth (read-only access)</li>
          <li style={{ marginBottom: '8px' }}>Fetch batches of 100-500 emails with filters</li>
          <li style={{ marginBottom: '8px' }}>Pre-tag emails automatically with the extraction algorithm</li>
          <li style={{ marginBottom: '8px' }}>Manually review and correct labels (TRUE/FALSE/MISSED)</li>
          <li style={{ marginBottom: '8px' }}>Export labeled data as JSONL for algorithm improvements</li>
        </ul>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#1976d2', marginTop: '32px' }}>Usage Workflow (5 Steps)</h2>
        <ol style={{ marginLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}><strong>ACCOUNTS Tab:</strong> Connect your Gmail and/or Outlook account</li>
          <li style={{ marginBottom: '8px' }}>
            <strong>TESTING Tab → Filters:</strong> Set date range, from address, search terms,
            batch size
          </li>
          <li style={{ marginBottom: '8px' }}><strong>Prepare Batch:</strong> Fetch emails matching your filters</li>
          <li style={{ marginBottom: '8px' }}><strong>Run Pre-Tag:</strong> Run the extraction algorithm on the batch</li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Review & Label:</strong> Click each email, verify the pre-tag, and label it:
            <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
              <li style={{ marginBottom: '8px' }}><strong>TRUE:</strong> Pre-tag is correct (OTP/Magic Link was found correctly)</li>
              <li style={{ marginBottom: '8px' }}>
                <strong>FALSE:</strong> Pre-tag is wrong (false positive or wrong value extracted)
              </li>
              <li style={{ marginBottom: '8px' }}><strong>MISSED:</strong> Pre-tag was NONE but there IS an OTP/Magic Link</li>
            </ul>
          </li>
          <li style={{ marginBottom: '8px' }}><strong>Export JSONL:</strong> Download the labeled dataset</li>
        </ol>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#1976d2', marginTop: '32px' }}>Privacy Guarantees</h2>
        <ul style={{ marginLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>✅ All processing happens locally on your device</li>
          <li style={{ marginBottom: '8px' }}>✅ No data is sent to any server</li>
          <li style={{ marginBottom: '8px' }}>✅ OAuth tokens are stored encrypted in browser storage</li>
          <li style={{ marginBottom: '8px' }}>✅ Email content is only stored in IndexedDB (local database)</li>
          <li style={{ marginBottom: '8px' }}>✅ Exported JSONL files stay on your device until you share them</li>
        </ul>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#1976d2', marginTop: '32px' }}>How Labels Improve the Algorithm</h2>
        <p>
          The exported JSONL file contains:
        </p>
        <ul style={{ marginLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>Pre-tags from the current extraction algorithm</li>
          <li style={{ marginBottom: '8px' }}>Your manual labels (ground truth)</li>
          <li style={{ marginBottom: '8px' }}>Candidate scores and extraction features</li>
          <li style={{ marginBottom: '8px' }}>Reasons for false positives/negatives</li>
        </ul>
        <p>
          Claude (AI) will analyze the JSONL file to identify:
        </p>
        <ul style={{ marginLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}><strong>False positives:</strong> preTag=OTP but label=FALSE → adjust deny patterns</li>
          <li style={{ marginBottom: '8px' }}><strong>False negatives:</strong> preTag=NONE but label=MISSED → improve detection</li>
          <li style={{ marginBottom: '8px' }}><strong>Wrong values:</strong> Extracted code doesn't match correct value → fix regex</li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Score calibration:</strong> Adjust confidence thresholds based on actual
            accuracy
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#1976d2', marginTop: '32px' }}>Sharing Your JSONL Files</h2>
        <p>
          Once you've labeled a batch and exported the JSONL file, you can share it securely:
        </p>
        <ol style={{ marginLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>Open the exported file in a text editor to verify it looks correct</li>
          <li style={{ marginBottom: '8px' }}>
            Send the file to the development team or share via secure channel
          </li>
          <li style={{ marginBottom: '8px' }}>Include notes about any patterns you noticed during labeling</li>
        </ol>
        <p>
          <strong>⚠️ Security Note:</strong> The JSONL file contains email subjects and extracted
          codes/links. Ensure you're comfortable sharing this data or use a test account with
          non-sensitive emails.
        </p>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#1976d2', marginTop: '32px' }}>Tips for Effective Labeling</h2>
        <ul style={{ marginLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Start small:</strong> Label 50-100 emails per batch to avoid fatigue
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Focus on errors:</strong> Priority review emails where preTag score is 0.4-0.7
            (uncertain)
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Use reason chips:</strong> Helps identify common failure patterns (e.g.,
            BACKUP_CODES_LIST, ORDER_ID)
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Add notes:</strong> Explain tricky cases in the note field for context
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Test multilingual:</strong> If possible, label emails in different languages
            (Japanese, Chinese, Russian) to improve i18n support
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#1976d2', marginTop: '32px' }}>Troubleshooting</h2>
        <p style={{ marginBottom: '8px' }}>
          <strong>OAuth fails:</strong> Make sure you're signed into Chrome with the Google account
          you want to connect
        </p>
        <p style={{ marginBottom: '8px' }}>
          <strong>Pre-tag crashes:</strong> Check browser console (F12) for errors; may need to
          reduce batch size
        </p>
        <p style={{ marginBottom: '8px' }}>
          <strong>Export fails:</strong> Check chrome://extensions/ → InboxKey Reviewer → make sure
          "downloads" permission is enabled
        </p>
        <p style={{ marginBottom: '8px' }}>
          <strong>Labels not saving:</strong> Check IndexedDB quota in DevTools → Application →
          Storage
        </p>
      </section>

      <footer style={{
        marginTop: '48px',
        paddingTop: '24px',
        borderTop: '1px solid #eee',
        textAlign: 'center',
        color: '#666'
      }}>
        <p>
          <strong>InboxKey Reviewer v0.1.0</strong> | Dev Tool | Not for production use
        </p>
      </footer>
    </div>
  )
}
