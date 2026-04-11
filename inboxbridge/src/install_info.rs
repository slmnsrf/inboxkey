//! Detect the install shape of the running bridge binary.
//!
//! The extension's uninstall modal needs to tell the user the exact
//! path to remove, and whether it is a file or a folder. Historically
//! the modal guessed based on OS, which was wrong for two cases:
//!
//! - Windows Inno Setup + portable install.ps1 both create
//!   `%LOCALAPPDATA%\InboxBridge\` with `inboxbridge.exe` and
//!   `com.inboxkey.bridge.json` side by side. The user should delete
//!   the folder.
//! - macOS pkg installer puts the binary at `/usr/local/bin/inboxbridge`
//!   with the Chrome native messaging manifest living elsewhere under
//!   `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`.
//!   The user should delete the file, not the parent directory (which
//!   is a system-owned bin dir).
//!
//! The detection here uses the **co-located Chrome manifest** as the
//! canonical signal for "directory install." This works uniformly:
//!
//! - Windows installer + portable: manifest lives in the install dir
//!   -> detected as `Directory`.
//! - macOS pkg: manifest is elsewhere -> detected as `SingleBinary`.
//! - macOS .app bundle (hypothetical future layout): detected up the
//!   path chain via `find_enclosing_app_bundle`, returned as
//!   `AppBundle`.
//! - Portable Linux drop or any other single-file layout without a
//!   co-located manifest -> `SingleBinary` fallback.
//!
//! # Test seam
//!
//! The public entry point `detect_install_info()` is a thin wrapper
//! around `std::env::current_exe()`. The real logic lives in
//! `detect_install_info_for_exe(exe: &Path)` which takes an explicit
//! path so unit tests can exercise the rules against synthetic
//! directory layouts without touching the test runner's real binary.

use crate::protocol::{InstallInfo, InstallKind};
use std::path::{Path, PathBuf};

/// Detect install info for the currently running bridge executable.
/// Runs on every `bridge.ping` (no cache) per design: the cost is a
/// single `current_exe` + canonicalize + up to one `Path::exists`
/// check, sub-millisecond.
pub fn detect_install_info() -> InstallInfo {
    let exe = std::env::current_exe()
        .and_then(|p| std::fs::canonicalize(&p))
        .unwrap_or_else(|_| PathBuf::from("<unknown>"));
    detect_install_info_for_exe(&exe)
}

/// Pure detection logic. Takes an absolute, already-canonicalized path
/// to the running executable and returns the install shape.
///
/// Rule order matters: AppBundle check runs first so a `.app` bundle on
/// macOS wins over the manifest-co-location heuristic even if someone
/// hand-placed a manifest next to the inner binary.
pub fn detect_install_info_for_exe(exe: &Path) -> InstallInfo {
    let exe_str = exe.to_string_lossy().to_string();

    // Rule 1: macOS .app bundle. Walk up the path looking for a segment
    // ending in ".app". Cheap string match, no filesystem I/O.
    if let Some(app_path) = find_enclosing_app_bundle(exe) {
        return InstallInfo {
            executable_path: exe_str,
            kind: InstallKind::AppBundle,
            uninstall_target: app_path.to_string_lossy().to_string(),
            has_os_installer_entry: None,
        };
    }

    // Rule 2: Directory install via co-located Chrome native-messaging
    // manifest. Matches both Windows Inno Setup and Windows portable
    // install.ps1 layouts. The `has_os_installer_entry` heuristic then
    // distinguishes between those two paths by looking for Inno Setup's
    // sibling uninstaller executable.
    if let Some(parent) = exe.parent() {
        let manifest = parent.join("com.inboxkey.bridge.json");
        if manifest.exists() {
            return InstallInfo {
                executable_path: exe_str,
                kind: InstallKind::Directory,
                uninstall_target: parent.to_string_lossy().to_string(),
                has_os_installer_entry: detect_os_installer_entry(parent),
            };
        }
    }

    // Rule 3: Fallback. Single binary -- the user should delete the
    // file itself, not its parent directory. This is correct for the
    // macOS pkg installer (/usr/local/bin/inboxbridge) and any portable
    // Linux drop without a co-located manifest.
    InstallInfo {
        executable_path: exe_str.clone(),
        kind: InstallKind::SingleBinary,
        uninstall_target: exe_str,
        has_os_installer_entry: None,
    }
}

/// Detect whether an install directory was created by an OS installer
/// that exposes itself in the system's uninstaller UI.
///
/// Currently scoped to Windows: Inno Setup drops an `unins000.exe`
/// (and siblings `unins001.exe`, etc.) in the install directory and
/// registers a matching entry under
/// `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\...`.
/// Portable installs created by our `install.ps1` do NOT drop that
/// executable, so its absence is a strong signal that "Open Windows
/// Settings" will not find InboxBridge.
///
/// Returns `Some(true)` when an Inno Setup uninstaller is present,
/// `Some(false)` when it is absent (directory kind but no installer),
/// and `None` when we cannot or should not answer (non-Windows, no
/// parent directory, filesystem error).
fn detect_os_installer_entry(install_dir: &Path) -> Option<bool> {
    // The check is layout-based rather than OS-specific so tests can
    // exercise it cross-platform. On Windows it captures both the Inno
    // installer (unins000.exe) and any future installer that drops a
    // sibling named `unins*.exe`. On other platforms this still runs
    // but will almost always return Some(false) because Linux/macOS
    // installers do not typically colocate an uninstaller binary.
    let entries = match std::fs::read_dir(install_dir) {
        Ok(e) => e,
        Err(_) => return None,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_lowercase();
        if name_str.starts_with("unins") && name_str.ends_with(".exe") {
            return Some(true);
        }
    }
    Some(false)
}

/// If any ancestor segment of `exe` ends in `.app`, return the path up
/// through that segment. Otherwise return None.
fn find_enclosing_app_bundle(exe: &Path) -> Option<PathBuf> {
    let mut current = exe.parent();
    while let Some(dir) = current {
        if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
            if name.ends_with(".app") {
                return Some(dir.to_path_buf());
            }
        }
        current = dir.parent();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn test_dir() -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("inboxbridge_install_info_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn detects_directory_install_portable_layout_no_os_installer_entry() {
        // Mirrors Windows portable install.ps1 layout: exe +
        // com.inboxkey.bridge.json side by side, but NO sibling Inno
        // uninstaller. has_os_installer_entry should be Some(false) so
        // the modal suppresses the "Open Windows Settings" CTA.
        let dir = test_dir();
        let exe = dir.join("inboxbridge.exe");
        std::fs::write(&exe, b"").unwrap();
        std::fs::write(dir.join("com.inboxkey.bridge.json"), b"{}").unwrap();

        let info = detect_install_info_for_exe(&exe);
        assert!(matches!(info.kind, InstallKind::Directory));
        assert_eq!(info.uninstall_target, dir.to_string_lossy());
        assert_eq!(info.executable_path, exe.to_string_lossy());
        assert_eq!(info.has_os_installer_entry, Some(false));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_directory_install_inno_layout_with_os_installer_entry() {
        // Mirrors Windows Inno Setup layout: exe + manifest + unins000.exe
        // sibling. has_os_installer_entry should be Some(true) so the
        // modal shows the "Open Windows Settings" CTA as a valid shortcut.
        let dir = test_dir();
        let exe = dir.join("inboxbridge.exe");
        std::fs::write(&exe, b"").unwrap();
        std::fs::write(dir.join("com.inboxkey.bridge.json"), b"{}").unwrap();
        std::fs::write(dir.join("unins000.exe"), b"").unwrap();

        let info = detect_install_info_for_exe(&exe);
        assert!(matches!(info.kind, InstallKind::Directory));
        assert_eq!(info.has_os_installer_entry, Some(true));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_single_binary_when_no_colocated_manifest() {
        // Mirrors macOS pkg layout: binary alone, manifest lives
        // elsewhere. Should report the file itself as the uninstall
        // target, NOT the parent directory (which could be /usr/local/bin).
        // has_os_installer_entry is None because the signal is not
        // meaningful for single-binary installs.
        let dir = test_dir();
        let exe = dir.join("inboxbridge");
        std::fs::write(&exe, b"").unwrap();

        let info = detect_install_info_for_exe(&exe);
        assert!(matches!(info.kind, InstallKind::SingleBinary));
        assert_eq!(info.uninstall_target, exe.to_string_lossy());
        assert_eq!(info.executable_path, exe.to_string_lossy());
        assert_eq!(info.has_os_installer_entry, None);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_app_bundle_from_contents_macos_path() {
        // Pure path test -- no filesystem setup needed. The detection
        // walks ancestors looking for a `.app` segment.
        let exe = PathBuf::from("/Applications/InboxBridge.app/Contents/MacOS/inboxbridge");
        let info = detect_install_info_for_exe(&exe);
        assert!(matches!(info.kind, InstallKind::AppBundle));
        assert_eq!(info.uninstall_target, "/Applications/InboxBridge.app");
        assert_eq!(info.has_os_installer_entry, None);
    }

    #[test]
    fn app_bundle_wins_over_manifest_colocation() {
        // Edge case: a user somehow placed a Chrome manifest inside a
        // .app bundle alongside the inner binary. The bundle rule should
        // still win because Rule 1 runs first.
        let dir = test_dir();
        let app_dir = dir.join("InboxBridge.app");
        let macos_dir = app_dir.join("Contents").join("MacOS");
        std::fs::create_dir_all(&macos_dir).unwrap();
        let exe = macos_dir.join("inboxbridge");
        std::fs::write(&exe, b"").unwrap();
        std::fs::write(macos_dir.join("com.inboxkey.bridge.json"), b"{}").unwrap();

        let info = detect_install_info_for_exe(&exe);
        assert!(matches!(info.kind, InstallKind::AppBundle));
        assert_eq!(info.uninstall_target, app_dir.to_string_lossy());

        std::fs::remove_dir_all(&dir).ok();
    }
}
