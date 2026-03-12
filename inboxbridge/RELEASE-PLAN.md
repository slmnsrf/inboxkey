# InboxBridge GitHub Release Plan (Ultrathink Analysis)

**Goal:** Distribute InboxBridge via GitHub Releases with professional installers for Windows, macOS, and Linux.

**Status:** Planning Phase → Implementation Required
**Timeline:** 2-4 weeks (depending on code signing procurement)
**Complexity:** High (multi-platform packaging + code signing)

---

## Executive Summary

**What we need:**
- ✅ **Windows:** `.msi` installer (via WiX Toolset)
- ✅ **macOS:** `.pkg` installer (via `pkgbuild`)
- ✅ **Linux:** `.deb` (Debian/Ubuntu) and `.rpm` (Fedora/RHEL) packages
- ✅ **CI/CD:** GitHub Actions workflow for automated builds
- ⚠️ **Code Signing:** Optional but **highly recommended** for trust

**Current vs Target:**

| Platform | Current | Target | Gap |
|----------|---------|--------|-----|
| **Windows** | Setup script (WSL) | `InboxBridge-1.0.0.msi` | Need: WiX build, code signing |
| **macOS** | Setup script | `InboxBridge-1.0.0.pkg` | Need: pkgbuild, notarization |
| **Linux** | Setup script | `.deb` + `.rpm` packages | Need: fpm or cargo-deb/rpm |
| **Distribution** | Manual (git clone) | GitHub Releases (download) | Need: CI/CD pipeline |

---

## Part 1: Technical Requirements

### 1.1 Cross-Compilation Targets

InboxBridge needs to be built for multiple platforms:

```rust
// Cargo.toml targets
[target.x86_64-pc-windows-gnu]     // Windows 64-bit
[target.x86_64-apple-darwin]       // macOS Intel
[target.aarch64-apple-darwin]      // macOS Apple Silicon (M1/M2/M3)
[target.x86_64-unknown-linux-gnu]  // Linux 64-bit
```

**Build Matrix:**

| OS | Architecture | Rust Target | Output |
|----|--------------|-------------|--------|
| Windows | x86_64 | `x86_64-pc-windows-gnu` | `inboxbridge.exe` |
| macOS (Intel) | x86_64 | `x86_64-apple-darwin` | `inboxbridge` |
| macOS (ARM) | aarch64 | `aarch64-apple-darwin` | `inboxbridge` |
| Linux | x86_64 | `x86_64-unknown-linux-gnu` | `inboxbridge` |

**Universal Binary (macOS):**
Combine Intel + ARM into single binary:
```bash
lipo -create \
  target/x86_64-apple-darwin/release/inboxbridge \
  target/aarch64-apple-darwin/release/inboxbridge \
  -output target/universal/inboxbridge
```

---

### 1.2 Installer Requirements

#### **Windows (`.msi` via WiX Toolset)**

**What it must do:**
1. Install binary to `C:\Program Files\InboxBridge\inboxbridge.exe`
2. Install manifest to `C:\Program Files\InboxBridge\com.inboxkey.bridge.json`
3. Create registry key: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge`
4. Set registry value to manifest path
5. Add to "Programs and Features" for uninstall
6. **Optional:** Install Visual C++ Runtime if missing

**Tools needed:**
- WiX Toolset 3.11+ (installer framework)
- `candle.exe` (WiX compiler)
- `light.exe` (WiX linker)
- **Optional:** `signtool.exe` (for code signing)

**Cost:**
- WiX Toolset: **Free**
- Code signing certificate: **$100-$400/year** (Sectigo, DigiCert)

---

#### **macOS (`.pkg` via pkgbuild)**

**What it must do:**
1. Install binary to `/usr/local/bin/inboxbridge` (system-wide) OR `~/Library/Application Support/InboxBridge/` (user-level)
2. Install manifest to `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json`
3. Set executable permissions (`chmod +x`)
4. Register in macOS Installer.app
5. **Optional:** Create LaunchAgent (auto-start on login)

**Tools needed:**
- `pkgbuild` (built into macOS)
- `productbuild` (for distribution packages)
- **Optional:** `codesign` (for code signing)
- **Required for distribution:** Apple Developer account ($99/year) for notarization

**Cost:**
- pkgbuild: **Free** (built into macOS)
- Apple Developer Program: **$99/year** (required for notarization)

**Notarization:** macOS Catalina+ requires apps to be **notarized** by Apple. Without it, users see "unidentified developer" warning.

---

#### **Linux (`.deb` and `.rpm`)**

**What they must do:**
1. Install binary to `/usr/local/bin/inboxbridge` or `~/.local/bin/`
2. Install manifest to `~/.config/google-chrome/NativeMessagingHosts/com.inboxkey.bridge.json`
3. Set executable permissions
4. Register with package manager (dpkg/rpm)
5. Create uninstaller

**Tools needed:**
- **Option 1:** `cargo-deb` + `cargo-generate-rpm` (Rust-native, recommended)
- **Option 2:** `fpm` (Effing Package Management - Ruby gem, cross-platform)
- **Option 3:** `dpkg-deb` + `rpmbuild` (manual, complex)

**Cost:**
- All tools: **Free**
- No code signing required for Linux (GPG signatures optional)

---

## Part 2: Implementation Plan

### Phase 1: GitHub Actions CI/CD Setup (Week 1)

**Goal:** Automate cross-platform builds on every release.

**File:** `.github/workflows/release.yml`

**Strategy:**
```yaml
name: Build Release

on:
  push:
    tags:
      - 'v*'  # Trigger on version tags (v1.0.0)

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - Checkout code
      - Install Rust + mingw-w64
      - Build for x86_64-pc-windows-gnu
      - Upload inboxbridge.exe artifact

  build-macos:
    runs-on: macos-latest
    steps:
      - Checkout code
      - Install Rust
      - Build for x86_64-apple-darwin (Intel)
      - Build for aarch64-apple-darwin (ARM)
      - Create universal binary (lipo)
      - Upload inboxbridge artifact

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - Checkout code
      - Install Rust + pkg-config + libssl-dev
      - Build for x86_64-unknown-linux-gnu
      - Upload inboxbridge artifact

  create-installers:
    needs: [build-windows, build-macos, build-linux]
    steps:
      - Download all artifacts
      - Create Windows MSI (WiX)
      - Create macOS PKG (pkgbuild)
      - Create Linux DEB (cargo-deb)
      - Create Linux RPM (cargo-generate-rpm)
      - Upload to GitHub Release
```

**Deliverables:**
- Automated builds on `git tag v1.0.0`
- GitHub Release created with all installers
- No manual steps required

**Time Estimate:** 3-5 days (including testing)

---

### Phase 2: Windows MSI Installer (Week 1-2)

**Tool:** WiX Toolset 3.11+

**Implementation:**

**File:** `inboxbridge/windows/Product.wxs`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*"
           Name="InboxBridge"
           Language="1033"
           Version="1.0.0"
           Manufacturer="InboxKey Contributors"
           UpgradeCode="YOUR-GUID-HERE">

    <Package InstallerVersion="200" Compressed="yes" InstallScope="perMachine" />

    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />
    <MediaTemplate EmbedCab="yes" />

    <!-- Installation directory -->
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="InboxBridge" />
      </Directory>
    </Directory>

    <!-- Components to install -->
    <ComponentGroup Id="ProductComponents" Directory="INSTALLFOLDER">
      <Component Id="InboxBridgeBinary" Guid="YOUR-GUID-1">
        <File Id="InboxBridgeExe"
              Source="$(var.BinaryPath)\inboxbridge.exe"
              KeyPath="yes" />
      </Component>

      <Component Id="NativeMessagingManifest" Guid="YOUR-GUID-2">
        <File Id="ManifestJson"
              Source="$(var.BinaryPath)\com.inboxkey.bridge.json"
              KeyPath="yes" />
      </Component>

      <!-- Registry key for Native Messaging -->
      <Component Id="ChromeRegistryKey" Guid="YOUR-GUID-3">
        <RegistryKey Root="HKCU"
                     Key="Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge">
          <RegistryValue Type="string"
                         Value="[INSTALLFOLDER]com.inboxkey.bridge.json" />
        </RegistryKey>
      </Component>
    </ComponentGroup>

    <!-- Features -->
    <Feature Id="ProductFeature" Title="InboxBridge" Level="1">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
  </Product>
</Wix>
```

**Build command:**
```bash
# Compile WiX source to object file
candle.exe Product.wxs -dBinaryPath=..\target\x86_64-pc-windows-gnu\release

# Link object file to MSI
light.exe Product.wixobj -out InboxBridge-1.0.0.msi

# Optional: Sign MSI
signtool.exe sign /f certificate.pfx /p password InboxBridge-1.0.0.msi
```

**GitHub Actions integration:**
```yaml
- name: Build Windows MSI
  run: |
    choco install wixtoolset -y
    candle windows/Product.wxs -dBinaryPath=target/x86_64-pc-windows-gnu/release
    light Product.wixobj -out InboxBridge-${{ github.ref_name }}.msi
```

**Deliverables:**
- `InboxBridge-1.0.0.msi` (5-10 MB)
- One-click install for Windows users
- Appears in "Add/Remove Programs"
- Automatic uninstaller

**Time Estimate:** 2-3 days (WiX learning curve)

**Complexity:** Medium (XML-based, good documentation)

---

### Phase 3: macOS PKG Installer (Week 2)

**Tool:** `pkgbuild` (built into macOS)

**Implementation:**

**Step 1: Create payload directory structure**
```bash
mkdir -p payload/usr/local/bin
mkdir -p payload/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

cp target/universal/inboxbridge payload/usr/local/bin/
chmod +x payload/usr/local/bin/inboxbridge

cp com.inboxkey.bridge.json payload/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

**Step 2: Create package**
```bash
pkgbuild --root payload \
         --identifier com.inboxkey.bridge \
         --version 1.0.0 \
         --install-location / \
         InboxBridge-1.0.0.pkg
```

**Step 3: Code sign (requires Apple Developer cert)**
```bash
# Sign package
productsign --sign "Developer ID Installer: Your Name" \
             InboxBridge-1.0.0.pkg \
             InboxBridge-1.0.0-signed.pkg

# Notarize with Apple
xcrun notarytool submit InboxBridge-1.0.0-signed.pkg \
                        --apple-id your@email.com \
                        --password app-specific-password \
                        --team-id TEAMID \
                        --wait

# Staple notarization ticket
xcrun stapler staple InboxBridge-1.0.0-signed.pkg
```

**GitHub Actions integration:**
```yaml
- name: Build macOS PKG
  run: |
    mkdir -p payload/usr/local/bin
    cp target/universal/inboxbridge payload/usr/local/bin/
    pkgbuild --root payload \
             --identifier com.inboxkey.bridge \
             --version ${{ github.ref_name }} \
             --install-location / \
             InboxBridge-${{ github.ref_name }}.pkg
```

**Deliverables:**
- `InboxBridge-1.0.0.pkg` (2-5 MB)
- Signed and notarized (if using Apple Developer account)
- One-click install for macOS users

**Time Estimate:** 2-3 days (including notarization setup)

**Complexity:** Medium (notarization requires Apple Developer account)

**Cost:** $99/year (Apple Developer Program - **required** for notarization)

---

### Phase 4: Linux Packages (DEB & RPM) (Week 2-3)

**Tool:** `cargo-deb` + `cargo-generate-rpm`

**Implementation:**

**Step 1: Install tools**
```bash
cargo install cargo-deb
cargo install cargo-generate-rpm
```

**Step 2: Update Cargo.toml**
```toml
[package.metadata.deb]
maintainer = "InboxKey Contributors <support@inboxkey.com>"
copyright = "2025, InboxKey Contributors"
license-file = ["LICENSE", "4"]
extended-description = """\
InboxBridge is a native messaging host that enables InboxKey browser extension \
to connect to IMAP email accounts for verification code extraction."""
depends = "$auto, libsecret-1-0"
section = "utility"
priority = "optional"
assets = [
    ["target/release/inboxbridge", "usr/local/bin/", "755"],
    ["com.inboxkey.bridge.json", "usr/share/inboxbridge/", "644"],
]

[package.metadata.generate-rpm]
assets = [
    { source = "target/release/inboxbridge", dest = "/usr/local/bin/inboxbridge", mode = "755" },
    { source = "com.inboxkey.bridge.json", dest = "/usr/share/inboxbridge/com.inboxkey.bridge.json", mode = "644" },
]
```

**Step 3: Build packages**
```bash
# Build DEB package
cargo deb --target x86_64-unknown-linux-gnu

# Output: target/debian/inboxbridge_1.0.0_amd64.deb

# Build RPM package
cargo generate-rpm --target x86_64-unknown-linux-gnu

# Output: target/generate-rpm/inboxbridge-1.0.0-1.x86_64.rpm
```

**GitHub Actions integration:**
```yaml
- name: Build Linux Packages
  run: |
    cargo install cargo-deb cargo-generate-rpm
    cargo deb --target x86_64-unknown-linux-gnu
    cargo generate-rpm --target x86_64-unknown-linux-gnu
```

**Deliverables:**
- `inboxbridge_1.0.0_amd64.deb` (Ubuntu, Debian, Mint)
- `inboxbridge-1.0.0-1.x86_64.rpm` (Fedora, RHEL, CentOS)
- Users install via: `sudo apt install ./inboxbridge_1.0.0_amd64.deb`

**Time Estimate:** 1-2 days

**Complexity:** Low (cargo-deb/rpm are well-documented)

**Cost:** Free

---

### Phase 5: Automated Release Workflow (Week 3-4)

**Complete GitHub Actions workflow:**

**File:** `.github/workflows/release.yml`

```yaml
name: Release InboxBridge

on:
  push:
    tags:
      - 'v*'

env:
  CARGO_TERM_COLOR: always

jobs:
  create-release:
    name: Create GitHub Release
    runs-on: ubuntu-latest
    outputs:
      upload_url: ${{ steps.create_release.outputs.upload_url }}
    steps:
      - name: Create Release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: InboxBridge ${{ github.ref }}
          draft: false
          prerelease: false

  build-windows:
    name: Build Windows
    runs-on: windows-latest
    needs: create-release
    steps:
      - uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: x86_64-pc-windows-gnu

      - name: Install mingw-w64
        run: choco install mingw -y

      - name: Build
        run: cargo build --release --target x86_64-pc-windows-gnu

      - name: Install WiX
        run: choco install wixtoolset -y

      - name: Create MSI
        run: |
          candle windows/Product.wxs -dBinaryPath=target/x86_64-pc-windows-gnu/release
          light Product.wixobj -out InboxBridge-${{ github.ref_name }}.msi

      - name: Upload MSI to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ needs.create-release.outputs.upload_url }}
          asset_path: ./InboxBridge-${{ github.ref_name }}.msi
          asset_name: InboxBridge-${{ github.ref_name }}-windows-x64.msi
          asset_content_type: application/x-msi

  build-macos:
    name: Build macOS
    runs-on: macos-latest
    needs: create-release
    steps:
      - uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: x86_64-apple-darwin

      - name: Add ARM target
        run: rustup target add aarch64-apple-darwin

      - name: Build Intel
        run: cargo build --release --target x86_64-apple-darwin

      - name: Build ARM
        run: cargo build --release --target aarch64-apple-darwin

      - name: Create Universal Binary
        run: |
          mkdir -p target/universal
          lipo -create \
            target/x86_64-apple-darwin/release/inboxbridge \
            target/aarch64-apple-darwin/release/inboxbridge \
            -output target/universal/inboxbridge

      - name: Create PKG
        run: |
          mkdir -p payload/usr/local/bin
          cp target/universal/inboxbridge payload/usr/local/bin/
          chmod +x payload/usr/local/bin/inboxbridge
          pkgbuild --root payload \
                   --identifier com.inboxkey.bridge \
                   --version ${{ github.ref_name }} \
                   --install-location / \
                   InboxBridge-${{ github.ref_name }}.pkg

      - name: Upload PKG to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ needs.create-release.outputs.upload_url }}
          asset_path: ./InboxBridge-${{ github.ref_name }}.pkg
          asset_name: InboxBridge-${{ github.ref_name }}-macos-universal.pkg
          asset_content_type: application/x-newton-compatible-pkg

  build-linux:
    name: Build Linux
    runs-on: ubuntu-latest
    needs: create-release
    steps:
      - uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: x86_64-unknown-linux-gnu

      - name: Install dependencies
        run: sudo apt-get install -y pkg-config libssl-dev

      - name: Build
        run: cargo build --release --target x86_64-unknown-linux-gnu

      - name: Install cargo-deb
        run: cargo install cargo-deb

      - name: Install cargo-generate-rpm
        run: cargo install cargo-generate-rpm

      - name: Build DEB
        run: cargo deb --target x86_64-unknown-linux-gnu

      - name: Build RPM
        run: cargo generate-rpm --target x86_64-unknown-linux-gnu

      - name: Upload DEB to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ needs.create-release.outputs.upload_url }}
          asset_path: ./target/debian/inboxbridge_${{ github.ref_name }}_amd64.deb
          asset_name: inboxbridge_${{ github.ref_name }}_amd64.deb
          asset_content_type: application/vnd.debian.binary-package

      - name: Upload RPM to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ needs.create-release.outputs.upload_url }}
          asset_path: ./target/generate-rpm/inboxbridge-${{ github.ref_name }}-1.x86_64.rpm
          asset_name: inboxbridge-${{ github.ref_name }}-1.x86_64.rpm
          asset_content_type: application/x-rpm
```

**Deliverables:**
- Fully automated release on `git tag v1.0.0`
- All installers uploaded to GitHub Release
- Users download directly from GitHub

**Time Estimate:** 2-3 days (testing all platforms)

---

## Part 3: Code Signing Analysis

### Why Code Signing Matters

**Without code signing:**
- ❌ Windows: "Unknown publisher" warning (yellow banner)
- ❌ macOS: "Unidentified developer" error (can't open)
- ❌ Linux: No trust issues (GPG signatures optional)

**With code signing:**
- ✅ Windows: "Verified publisher: InboxKey Contributors"
- ✅ macOS: Opens without warnings (if notarized)
- ✅ Users trust the installer
- ✅ Professional appearance

### Cost-Benefit Analysis

| Platform | Signing Type | Cost | Benefit | Required? |
|----------|--------------|------|---------|-----------|
| **Windows** | Authenticode cert | $100-400/year | Removes SmartScreen warning | Recommended |
| **macOS** | Apple Developer | $99/year | Removes Gatekeeper block | **Required** for Catalina+ |
| **Linux** | GPG signature | Free | Package verification | Optional |

**Recommendation:**
- **Phase 1 (Beta):** Ship unsigned (users can bypass warnings)
- **Phase 2 (Public):** Get Windows cert + Apple Developer
- **Phase 3 (Enterprise):** Add EV code signing cert ($300-500/year)

---

## Part 4: Alternative Approaches

### Option A: Full Automation (Recommended)
✅ GitHub Actions builds everything
✅ Users download installers from GitHub Releases
✅ Professional, scalable, maintainable
⚠️ Requires: WiX setup, Apple Developer account, 2-4 weeks effort

### Option B: Hybrid (Quick Start)
✅ Provide pre-built binaries (no installers)
✅ Users run setup scripts (current approach)
⚠️ Less professional, manual steps required
✅ Can ship this week

### Option C: Minimal (Fastest)
✅ Just cross-compile binaries
✅ No installers, users extract .zip/.tar.gz
⚠️ Not user-friendly for non-technical users
✅ Can ship today

**Recommendation:** Start with **Option C** for immediate beta release, migrate to **Option A** for v1.0 public release.

---

## Part 5: Proposed Timeline

### Week 1: Foundation
- [ ] Set up GitHub Actions for cross-compilation
- [ ] Build binaries for all platforms
- [ ] Create .zip/.tar.gz archives
- [ ] **Ship beta release** (pre-built binaries, no installers)

### Week 2: Windows Installer
- [ ] Set up WiX Toolset
- [ ] Create Product.wxs manifest
- [ ] Build and test MSI locally
- [ ] Integrate into GitHub Actions
- [ ] **Optional:** Acquire code signing cert ($100-400)

### Week 3: macOS Installer
- [ ] Create pkgbuild payload structure
- [ ] Build and test PKG locally
- [ ] Integrate into GitHub Actions
- [ ] **Optional:** Enroll in Apple Developer Program ($99)
- [ ] **Optional:** Set up notarization

### Week 4: Linux Packages
- [ ] Update Cargo.toml metadata for deb/rpm
- [ ] Build and test packages locally
- [ ] Integrate into GitHub Actions
- [ ] Test on Ubuntu, Fedora, Arch

### Week 5: Polish & Release
- [ ] Update README with download links
- [ ] Create installation documentation
- [ ] Test all installers on clean VMs
- [ ] **Ship v1.0 public release**

---

## Part 6: Cost Summary

| Item | Cost | Required? | Timeline |
|------|------|-----------|----------|
| **GitHub Actions** | Free (2000 min/month) | Yes | Immediate |
| **WiX Toolset** | Free | Yes | Week 2 |
| **cargo-deb/rpm** | Free | Yes | Week 4 |
| **Windows Code Signing** | $100-400/year | Recommended | Week 2-3 |
| **Apple Developer** | $99/year | **Required** for macOS notarization | Week 3 |
| **Total (without signing)** | $0 | - | - |
| **Total (with signing)** | $199-499/year | - | - |

---

## Part 7: Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **GitHub Actions build failures** | High | Test locally first, use matrix builds |
| **Code signing cert delays** | Medium | Start unsigned, add later |
| **macOS notarization rejection** | Medium | Follow Apple guidelines, test on VM |
| **WiX learning curve** | Medium | Use template from this plan, allocate 2-3 days |
| **Windows SmartScreen warnings** | Low | Users can bypass, add cert later |
| **Linux package conflicts** | Low | Use standard FHS paths, test on VMs |

---

## Part 8: Next Steps (Immediate Actions)

### Option 1: Ship Beta Now (Recommended for Immediate Release)
```bash
# 1. Cross-compile for all platforms
cargo build --release --target x86_64-pc-windows-gnu
cargo build --release --target x86_64-apple-darwin
cargo build --release --target aarch64-apple-darwin
cargo build --release --target x86_64-unknown-linux-gnu

# 2. Create archives
zip InboxBridge-v1.0.0-beta-windows-x64.zip target/x86_64-pc-windows-gnu/release/inboxbridge.exe
tar czf InboxBridge-v1.0.0-beta-macos-universal.tar.gz target/universal/inboxbridge
tar czf InboxBridge-v1.0.0-beta-linux-x64.tar.gz target/x86_64-unknown-linux-gnu/release/inboxbridge

# 3. Create GitHub Release
git tag v1.0.0-beta
git push origin v1.0.0-beta
# Upload archives manually via GitHub UI

# 4. Update README with download links
```

**Time to ship:** 1 day
**User experience:** Manual extraction + setup script

---

### Option 2: Full Automation (Recommended for v1.0)
```bash
# 1. Create WiX manifest (see Phase 2)
# 2. Create GitHub Actions workflow (see Phase 5)
# 3. Acquire code signing certs (optional, see Part 3)
# 4. Test on clean VMs
# 5. Tag and release:
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions handles the rest
```

**Time to ship:** 2-4 weeks
**User experience:** One-click installers

---

## Part 9: Decision Matrix

Choose your approach based on priorities:

| Priority | Recommended Option | Timeline | Cost |
|----------|-------------------|----------|------|
| **Ship ASAP** | Pre-built binaries (.zip) | 1 day | $0 |
| **Professional release** | Full automation + installers | 2-4 weeks | $0-499/year |
| **Enterprise-ready** | Full automation + code signing | 3-5 weeks | $199-499/year |

---

## Conclusion

**Recommended Strategy:**

**Phase 1 (This Week):** Ship beta with pre-built binaries
- Users download .zip/.tar.gz from GitHub Releases
- Run setup scripts manually
- Good enough for early adopters

**Phase 2 (Next Month):** Migrate to installers
- Create Windows MSI (WiX)
- Create macOS PKG (pkgbuild)
- Create Linux DEB/RPM (cargo-deb/rpm)
- Automate via GitHub Actions

**Phase 3 (When Revenue Allows):** Add code signing
- Windows Authenticode cert ($100-400/year)
- Apple Developer notarization ($99/year)
- Professional, trusted installers

**Total effort:** 2-4 weeks for full automation
**Total cost:** $0 unsigned, $199-499/year signed
**Complexity:** Medium (WiX and pkgbuild learning curve)

**Next immediate action:** Create GitHub Actions workflow for cross-compilation, ship beta with pre-built binaries.
