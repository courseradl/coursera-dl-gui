use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("No stored cookies found")]
    NoCookies,
    #[error("Invalid cookies format: {0}")]
    InvalidFormat(String),
    #[error("Authentication failed: {0}")]
    AuthFailed(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
}

impl Serialize for AuthError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub user_id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub is_authenticated: bool,
}

pub fn get_storage_path() -> Result<PathBuf, AuthError> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("coursera-studio");
    fs::create_dir_all(&dir)?;
    Ok(dir.join("cookies.txt"))
}

pub fn save_cookies(raw_cookies: &str) -> Result<(), AuthError> {
    let path = get_storage_path()?;
    fs::write(&path, raw_cookies.trim())?;
    Ok(())
}

pub fn read_cookies() -> Result<String, AuthError> {
    let path = get_storage_path()?;
    if !path.exists() {
        return Err(AuthError::NoCookies);
    }
    let content = fs::read_to_string(path)?;
    if content.trim().is_empty() {
        return Err(AuthError::NoCookies);
    }
    Ok(content)
}

pub fn delete_cookies() -> Result<(), AuthError> {
    let path = get_storage_path()?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    clear_webview_storage();
    Ok(())
}

/// Clears WebKit HTTPStorages binarycookies so the webview doesn't stay permanently logged in
pub fn clear_webview_storage() {
    if let Some(home) = dirs::home_dir() {
        let http_storages = home.join("Library").join("HTTPStorages");
        if let Ok(entries) = fs::read_dir(&http_storages) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let name_lower = name.to_lowercase();
                    if (name_lower.contains("coursera") || name_lower.contains("courseradl")) 
                        && path.extension().and_then(|e| e.to_str()) == Some("binarycookies") {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }

        let webkit_dir = home.join("Library").join("WebKit");
        if let Ok(entries) = fs::read_dir(&webkit_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let name_lower = name.to_lowercase();
                    if name_lower.contains("coursera") || name_lower.contains("courseradl") {
                        let _ = fs::remove_dir_all(&path);
                    }
                }
            }
        }
    }
}

pub fn parse_cookie_header(raw: &str) -> (String, Option<String>) {
    let raw_trimmed = raw.trim();
    let mut pairs = Vec::new();
    let mut csrf_token = None;

    // 1. Try parsing JSON format (e.g. Cookie-Editor JSON export [ { "name": "CAUTH", "value": "..." } ])
    if raw_trimmed.starts_with('[') && raw_trimmed.ends_with(']') {
        if let Ok(json_arr) = serde_json::from_str::<Vec<serde_json::Value>>(raw_trimmed) {
            for item in json_arr {
                if let (Some(name), Some(val)) = (
                    item.get("name").and_then(|v| v.as_str()),
                    item.get("value").and_then(|v| v.as_str()),
                ) {
                    if name == "CSRF3-Token" {
                        csrf_token = Some(val.to_string());
                    }
                    pairs.push(format!("{}={}", name, val));
                }
            }
            if !pairs.is_empty() {
                return (pairs.join("; "), csrf_token);
            }
        }
    }

    // 2. Try semicolon-separated or tab-separated / Netscape / newline-separated format
    for raw_line in raw_trimmed.lines() {
        let mut line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        // Handle Cookie-Editor / Netscape `#HttpOnly_` prefix
        if line.starts_with("#HttpOnly_") {
            line = &line[10..];
        } else if line.starts_with('#') {
            continue;
        }

        // Tab-separated (Netscape format)
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 7 {
            let name = parts[5].trim();
            let value = parts[6].trim();
            if name == "CSRF3-Token" {
                csrf_token = Some(value.to_string());
            }
            pairs.push(format!("{}={}", name, value));
            continue;
        }

        // Semicolon-separated pairs in a single line (document.cookie or raw Cookie header format)
        for part in line.split(';') {
            let part_trimmed = part.trim();
            if part_trimmed.is_empty() {
                continue;
            }
            if let Some((k, v)) = part_trimmed.split_once('=') {
                let key = k.trim();
                let val = v.trim();
                if key == "CSRF3-Token" {
                    csrf_token = Some(val.to_string());
                }
                pairs.push(format!("{}={}", key, val));
            }
        }
    }

    let cookie_str = if pairs.is_empty() {
        raw_trimmed.to_string()
    } else {
        pairs.join("; ")
    };

    (cookie_str, csrf_token)
}

/// Parses Apple's binarycookies format used by Safari and WKWebView (macOS/iOS)
pub fn parse_binarycookies(data: &[u8]) -> Vec<(String, String, String)> {
    if data.len() < 8 || &data[0..4] != b"cook" {
        return Vec::new();
    }

    let num_pages = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;
    if data.len() < 8 + num_pages * 4 {
        return Vec::new();
    }

    let mut page_sizes = Vec::with_capacity(num_pages);
    for i in 0..num_pages {
        let offset = 8 + i * 4;
        let size = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as usize;
        page_sizes.push(size);
    }

    let mut pos = 8 + num_pages * 4;
    let mut cookies = Vec::new();

    for size in page_sizes {
        if pos + size > data.len() {
            break;
        }
        let page = &data[pos..pos + size];
        pos += size;

        if page.len() < 8 || &page[0..4] != b"\x00\x00\x01\x00" {
            continue;
        }

        let num_cookies = u32::from_le_bytes([page[4], page[5], page[6], page[7]]) as usize;
        if page.len() < 8 + num_cookies * 4 {
            continue;
        }

        let mut cookie_offsets = Vec::with_capacity(num_cookies);
        for i in 0..num_cookies {
            let offset_pos = 8 + i * 4;
            let c_offset = u32::from_le_bytes([
                page[offset_pos],
                page[offset_pos + 1],
                page[offset_pos + 2],
                page[offset_pos + 3],
            ]) as usize;
            cookie_offsets.push(c_offset);
        }

        for c_offset in cookie_offsets {
            if c_offset >= page.len() || c_offset + 32 > page.len() {
                continue;
            }
            let c_data = &page[c_offset..];
            if c_data.len() < 32 {
                continue;
            }

            let url_offset = u32::from_le_bytes([c_data[16], c_data[17], c_data[18], c_data[19]]) as usize;
            let name_offset = u32::from_le_bytes([c_data[20], c_data[21], c_data[22], c_data[23]]) as usize;
            let path_offset = u32::from_le_bytes([c_data[24], c_data[25], c_data[26], c_data[27]]) as usize;
            let val_offset = u32::from_le_bytes([c_data[28], c_data[29], c_data[30], c_data[31]]) as usize;

            let get_str = |start: usize| -> String {
                if start >= c_data.len() {
                    return String::new();
                }
                let slice = &c_data[start..];
                if let Some(end) = slice.iter().position(|&b| b == 0) {
                    String::from_utf8_lossy(&slice[..end]).into_owned()
                } else {
                    String::from_utf8_lossy(slice).into_owned()
                }
            };

            let domain = get_str(url_offset);
            let name = get_str(name_offset);
            let _path = get_str(path_offset);
            let val = get_str(val_offset);

            if !name.is_empty() {
                cookies.push((domain, name, val));
            }
        }
    }

    cookies
}

/// Searches for and extracts Coursera session cookies from macOS WebKit HTTPStorages
pub fn extract_coursera_cookies_from_system() -> Option<String> {
    let home = dirs::home_dir()?;
    let mut candidate_paths = Vec::new();

    // 1. Direct HTTPStorages binarycookies files
    let http_storages = home.join("Library").join("HTTPStorages");
    if let Ok(entries) = fs::read_dir(&http_storages) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("binarycookies") {
                candidate_paths.push(path);
            }
        }
    }

    // 2. WebKit / Application Support / Containers paths
    let extra_dirs = [
        home.join("Library").join("WebKit"),
        home.join("Library").join("Application Support"),
        home.join("Library").join("Containers"),
    ];

    for dir in &extra_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let sub = entry.path();
                let direct_cookie = sub.join("Cookies").join("Cookies.binarycookies");
                if direct_cookie.exists() {
                    candidate_paths.push(direct_cookie);
                }
                let nested_storage = sub.join("HTTPStorages");
                if nested_storage.is_dir() {
                    if let Ok(sub_entries) = fs::read_dir(&nested_storage) {
                        for sub_entry in sub_entries.flatten() {
                            let p = sub_entry.path();
                            if p.extension().and_then(|e| e.to_str()) == Some("binarycookies") {
                                candidate_paths.push(p);
                            }
                        }
                    }
                }
            }
        }
    }

    // Examine candidates, prioritising the one containing CAUTH or CSRF3-Token
    for path in candidate_paths {
        if let Ok(data) = fs::read(&path) {
            let all_cookies = parse_binarycookies(&data);
            let coursera_cookies: Vec<_> = all_cookies
                .into_iter()
                .filter(|(domain, _, _)| domain.contains("coursera"))
                .collect();

            let has_cauth = coursera_cookies.iter().any(|(_, name, _)| name == "CAUTH");
            if has_cauth || coursera_cookies.len() >= 5 {
                let mut netscape_lines = Vec::new();
                netscape_lines.push("# Netscape HTTP Cookie File".to_string());
                netscape_lines.push("# Captured from WebKit storage".to_string());

                for (domain, name, val) in coursera_cookies {
                    let d = if domain.starts_with('.') { domain } else { format!(".{}", domain) };
                    netscape_lines.push(format!("{}\tTRUE\t/\tTRUE\t2000000000\t{}\t{}", d, name, val));
                }

                return Some(netscape_lines.join("\n"));
            }
        }
    }

    None
}

