pub mod auth;
pub mod client;
pub mod downloader;

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::path::PathBuf;
use tokio::sync::Mutex;
use tauri::{AppHandle, State};
use auth::{read_cookies, save_cookies, delete_cookies, UserProfile, AuthError};
use client::{CourseraClient, EnrolledCourse};
use downloader::{CourseManifest, build_course_manifest, download_single_task, resolve_path};

pub struct AppState {
    pub client: Arc<Mutex<Option<CourseraClient>>>,
    pub active_manifest: Arc<Mutex<Option<CourseManifest>>>,
    pub is_downloading: Arc<Mutex<bool>>,
    pub output_dir: Arc<Mutex<Option<PathBuf>>>,
}

#[tauri::command]
async fn check_auth(state: State<'_, AppState>) -> Result<UserProfile, AuthError> {
    let raw = read_cookies()?;
    let mut client = CourseraClient::new(&raw)?;
    let profile = client.validate_and_get_profile().await?;
    
    let mut guard = state.client.lock().await;
    *guard = Some(client);

    Ok(profile)
}

#[tauri::command]
async fn login_with_cookies(cookies: String, state: State<'_, AppState>) -> Result<UserProfile, AuthError> {
    save_cookies(&cookies)?;
    let mut client = CourseraClient::new(&cookies)?;
    let profile = client.validate_and_get_profile().await?;

    let mut guard = state.client.lock().await;
    *guard = Some(client);

    Ok(profile)
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), AuthError> {
    delete_cookies()?;
    let mut guard = state.client.lock().await;
    *guard = None;
    Ok(())
}

#[tauri::command]
async fn get_enrolled_courses(state: State<'_, AppState>) -> Result<Vec<EnrolledCourse>, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or_else(|| "Not logged in".to_string())?;
    client.get_enrolled_courses().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_specialization_details(slug: String, state: State<'_, AppState>) -> Result<client::SpecializationDetails, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or_else(|| "Not logged in".to_string())?;
    client.get_specialization_details(&slug).await
}

#[tauri::command]
async fn enroll_in_course(course_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or_else(|| "Not logged in".to_string())?;
    client.enroll_in_course(&course_id).await
}

#[tauri::command]
async fn enroll_in_specialization_all(spec_id: String, course_ids: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or_else(|| "Not logged in".to_string())?;
    client.enroll_in_specialization_all(&spec_id, &course_ids).await
}

#[tauri::command]
async fn prepare_course_download(
    slug: String,
    is_spec: bool,
    prefix_sep: Option<String>,
    max_resolution: Option<u32>,
    state: State<'_, AppState>,
) -> Result<CourseManifest, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or_else(|| "Not logged in".to_string())?;
    let sep = prefix_sep.unwrap_or_else(|| " - ".to_string());

    let mut manifest = build_course_manifest(client, &slug, is_spec, &sep, max_resolution).await?;
    
    let out_dir = {
        let out_guard = state.output_dir.lock().await;
        out_guard.clone().unwrap_or_else(|| resolve_path("~/Downloads/Coursera"))
    };
    downloader::check_existing_files(&mut manifest, &out_dir).await;

    let mut m_guard = state.active_manifest.lock().await;
    *m_guard = Some(manifest.clone());

    Ok(manifest)
}

#[tauri::command]
async fn get_courses_download_status(
    slugs: Vec<String>,
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, downloader::CourseDownloadInfo>, String> {
    let out_dir = {
        let guard = state.output_dir.lock().await;
        guard.clone().unwrap_or_else(|| resolve_path("~/Downloads/Coursera"))
    };

    let mut results = std::collections::HashMap::new();
    for slug in slugs {
        let info = downloader::get_course_download_status_on_disk(&slug, &out_dir);
        results.insert(slug, info);
    }
    Ok(results)
}

#[tauri::command]
async fn get_all_downloaded_items(
    state: State<'_, AppState>,
) -> Result<Vec<downloader::DownloadedItem>, String> {
    let out_dir = {
        let guard = state.output_dir.lock().await;
        guard.clone().unwrap_or_else(|| resolve_path("~/Downloads/Coursera"))
    };
    let client = {
        let guard = state.client.lock().await;
        guard.clone()
    };
    Ok(downloader::get_all_downloaded_items(&out_dir, client.as_ref()).await)
}

#[tauri::command]
async fn set_output_directory(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let resolved = resolve_path(&path);
    let mut out = state.output_dir.lock().await;
    *out = Some(resolved.clone());
    Ok(resolved.to_string_lossy().to_string())
}

#[tauri::command]
async fn open_download_folder(path: Option<String>, state: State<'_, AppState>) -> Result<(), String> {
    let folder = if let Some(p) = path {
        resolve_path(&p)
    } else {
        let guard = state.output_dir.lock().await;
        guard.clone().unwrap_or_else(|| resolve_path("~/Downloads/Coursera"))
    };

    if !folder.exists() {
        let _ = tokio::fs::create_dir_all(&folder).await;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn start_download(
    max_concurrent: Option<usize>,
    min_delay: Option<u64>,
    max_delay: Option<u64>,
    delay_videos_only: Option<bool>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manifest_opt = {
        let guard = state.active_manifest.lock().await;
        guard.clone()
    };
    let manifest = manifest_opt.ok_or_else(|| "No active course manifest. Prepare download first.".to_string())?;

    let client_opt = {
        let guard = state.client.lock().await;
        guard.clone()
    };
    let client = client_opt.ok_or_else(|| "Not authenticated".to_string())?;

    let out_dir = {
        let guard = state.output_dir.lock().await;
        guard.clone().unwrap_or_else(|| resolve_path("~/Downloads/Coursera"))
    };

    let is_dl_flag = state.is_downloading.clone();
    {
        let mut dl_guard = is_dl_flag.lock().await;
        if *dl_guard {
            return Err("Download already in progress".to_string());
        }
        *dl_guard = true;
    }

    tokio::spawn(async move {
        let total = manifest.tasks.len();
        let already_completed = manifest.tasks.iter().filter(|t| t.status == downloader::TaskStatus::Completed).count();
        let completed = Arc::new(AtomicUsize::new(already_completed));
        
        let has_delay = max_delay.map(|d| d > 0).unwrap_or(false) || min_delay.map(|d| d > 0).unwrap_or(false);
        // If delay is active, force concurrency to 1 (sequential)
        let concurrency = if has_delay {
            1
        } else {
            max_concurrent.unwrap_or(4).clamp(1, 16)
        };
        
        let sem = Arc::new(tokio::sync::Semaphore::new(concurrency));
        let mut handlers = Vec::new();

        let tasks_to_download: Vec<_> = manifest.tasks.into_iter().filter(|t| t.status != downloader::TaskStatus::Completed).collect();

        if tasks_to_download.is_empty() {
            let mut dl_guard = is_dl_flag.lock().await;
            *dl_guard = false;
            let _ = tauri::Emitter::emit(&app, "download_progress", downloader::DownloadProgressEvent {
                task_id: "all".to_string(),
                status: downloader::TaskStatus::Completed,
                downloaded_bytes: 0,
                total_bytes: 0,
                progress_percent: 100.0,
                current_file: "All files already downloaded".to_string(),
                overall_completed: total,
                overall_total: total,
                error: None,
            });
            return;
        }

        let mut is_first_task = true;

        for mut task in tasks_to_download {
            let client_c = client.clone();
            let out_dir_c = out_dir.clone();
            let app_c = app.clone();
            let completed_c = completed.clone();
            let permit = match sem.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => break,
            };

            // Apply random delay before downloading files (or for videos only if enabled)
            let is_video = task.relative_path.ends_with(".mp4");
            let should_delay = has_delay && !is_first_task && (!delay_videos_only.unwrap_or(false) || is_video);
            
            if should_delay {
                let min_s = min_delay.unwrap_or(1);
                let max_s = max_delay.unwrap_or(min_s).max(min_s);
                let delay_secs = if min_s == max_s {
                    min_s
                } else {
                    rand::Rng::gen_range(&mut rand::thread_rng(), min_s..=max_s)
                };
                if delay_secs > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
                }
            }
            is_first_task = false;

            handlers.push(tokio::spawn(async move {
                let _permit = permit;
                let cur = completed_c.load(Ordering::Relaxed);
                let res = download_single_task(&client_c, &mut task, &out_dir_c, Some(&app_c), cur, total).await;
                if res.is_ok() {
                    completed_c.fetch_add(1, Ordering::Relaxed);
                }
            }));
        }

        for h in handlers {
            let _ = h.await;
        }

        let mut dl_guard = is_dl_flag.lock().await;
        *dl_guard = false;

        let final_count = completed.load(Ordering::Relaxed);
        let _ = tauri::Emitter::emit(&app, "download_progress", downloader::DownloadProgressEvent {
            task_id: "all".to_string(),
            status: downloader::TaskStatus::Completed,
            downloaded_bytes: 0,
            total_bytes: 0,
            progress_percent: 100.0,
            current_file: "Finished".to_string(),
            overall_completed: final_count,
            overall_total: total,
            error: None,
        });
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            client: Arc::new(Mutex::new(None)),
            active_manifest: Arc::new(Mutex::new(None)),
            is_downloading: Arc::new(Mutex::new(false)),
            output_dir: Arc::new(Mutex::new(Some(resolve_path("~/Downloads/Coursera")))),
        })
        .invoke_handler(tauri::generate_handler![
            check_auth,
            login_with_cookies,
            logout,
            get_enrolled_courses,
            get_courses_download_status,
            get_all_downloaded_items,
            get_specialization_details,
            enroll_in_course,
            enroll_in_specialization_all,
            prepare_course_download,
            set_output_directory,
            open_download_folder,
            start_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running coursera dl application");
}
