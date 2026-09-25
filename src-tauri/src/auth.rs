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
    Ok(())
}

pub fn parse_cookie_header(raw: &str) -> (String, Option<String>) {
    let mut pairs = Vec::new();
    let mut csrf_token = None;

    for mut line in raw.lines() {
        line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Handle Cookie-Editor / Netscape `#HttpOnly_` prefix
        if line.starts_with("#HttpOnly_") {
            line = &line[10..];
        } else if line.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 7 {
            let name = parts[5].trim();
            let value = parts[6].trim();
            if name == "CSRF3-Token" {
                csrf_token = Some(value.to_string());
            }
            pairs.push(format!("{}={}", name, value));
        } else if let Some((k, v)) = line.split_once('=') {
            let key = k.trim();
            let val = v.trim().trim_matches(';');
            if key == "CSRF3-Token" {
                csrf_token = Some(val.to_string());
            }
            pairs.push(format!("{}={}", key, val));
        }
    }

    let cookie_str = if pairs.is_empty() {
        raw.trim().to_string()
    } else {
        pairs.join("; ")
    };

    (cookie_str, csrf_token)
}
