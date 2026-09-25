use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use crate::client::{CourseraClient, COURSERA_BASE};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub id: String,
    pub title: String,
    pub url: String,
    pub relative_path: String,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: TaskStatus,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseManifest {
    pub course_name: String,
    pub slug: String,
    pub is_spec: bool,
    pub photo_url: Option<String>,
    pub tasks: Vec<DownloadTask>,
    pub total_files: usize,
    pub total_size_est: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseDownloadInfo {
    pub slug: String,
    pub course_name: String,
    pub path: String,
    pub photo_url: Option<String>,
    pub total_files: usize,
    pub downloaded_files: usize,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub percent: f64,
    pub status: String, // "not_downloaded" | "downloading" | "partially_downloaded" | "completed"
    pub is_spec: bool,
    pub is_completed: bool,
    pub last_updated: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressEvent {
    pub task_id: String,
    pub status: TaskStatus,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub progress_percent: f64,
    pub current_file: String,
    pub overall_completed: usize,
    pub overall_total: usize,
    pub error: Option<String>,
}

pub fn resolve_path(raw_path: &str) -> PathBuf {
    let trimmed = raw_path.trim();
    if trimmed.starts_with("~/") || trimmed == "~" {
        if let Some(home) = dirs::home_dir() {
            if trimmed == "~" {
                return home;
            }
            return home.join(&trimmed[2..]);
        }
    }
    PathBuf::from(trimmed)
}

pub fn sanitize_name(name: &str) -> String {
    let re = regex::Regex::new(r#"[<>:"/\\|?*\x00-\x1f]"#).unwrap();
    let clean = re.replace_all(name, "_");
    let trimmed = clean.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "unnamed".to_string()
    } else if trimmed.len() > 80 {
        trimmed[..80].trim().to_string()
    } else {
        trimmed.to_string()
    }
}

pub async fn build_course_manifest(
    client: &CourseraClient,
    slug: &str,
    is_spec: bool,
    prefix_sep: &str,
    max_resolution: Option<u32>,
) -> Result<CourseManifest, String> {
    let mut tasks = Vec::new();
    let course_name = sanitize_name(slug);
    let mut photo_url: Option<String> = None;

    if is_spec {
        let spec_url = format!(
            "{}/api/onDemandSpecializations.v1?q=slug&slug={}&includes=courseIds&fields=courseIds,name,slug,photoUrl,promoPhoto,logo,courses.v1(name,slug)",
            COURSERA_BASE, slug
        );
        let resp = client.client().get(&spec_url).send().await.map_err(|e| e.to_string())?;
        let spec_data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

        let elem = spec_data.get("elements")
            .and_then(|e| e.as_array())
            .and_then(|arr| arr.first());

        if let Some(el) = elem {
            photo_url = el.get("photoUrl")
                .or_else(|| el.get("promoPhoto"))
                .or_else(|| el.get("logo"))
                .and_then(|p| p.as_str())
                .map(String::from);
        }

        let spec_cids = elem
            .and_then(|s| s.get("courseIds"))
            .and_then(|ids| ids.as_array());

        let mut id_to_course = std::collections::HashMap::new();
        if let Some(courses) = spec_data.get("linked").and_then(|l| l.get("courses.v1")).and_then(|c| c.as_array()) {
            for c in courses {
                if let Some(id) = c.get("id").and_then(|i| i.as_str()) {
                    id_to_course.insert(id.to_string(), c.clone());
                }
            }
        }

        if let Some(cids) = spec_cids {
            for (c_idx, cid_val) in cids.iter().enumerate() {
                let cid = cid_val.as_str().unwrap_or_default();
                if let Some(c_obj) = id_to_course.get(cid) {
                    let c_slug = c_obj.get("slug").and_then(|s| s.as_str()).unwrap_or("");
                    if !c_slug.is_empty() {
                        let course_prefix = format!("{:02}{}{}", c_idx + 1, prefix_sep, sanitize_name(c_slug));
                        let spec_course_root = format!("{}/{}", course_name, course_prefix);
                        gather_course_items(client, c_slug, &spec_course_root, prefix_sep, max_resolution, &mut tasks).await?;
                    }
                }
            }
        }
    } else {
        // Fetch single course photo
        let c_url = format!("{}/api/onDemandCourses.v1?q=slug&slug={}&fields=photoUrl,promoPhoto", COURSERA_BASE, slug);
        if let Ok(c_resp) = client.client().get(&c_url).send().await {
            if let Ok(c_data) = c_resp.json::<serde_json::Value>().await {
                if let Some(c_el) = c_data.get("elements").and_then(|e| e.as_array()).and_then(|a| a.first()) {
                    photo_url = c_el.get("photoUrl")
                        .or_else(|| c_el.get("promoPhoto"))
                        .and_then(|p| p.as_str())
                        .map(String::from);
                }
            }
        }

        gather_course_items(client, slug, &course_name, prefix_sep, max_resolution, &mut tasks).await?;
    }

    let total_files = tasks.len();
    let manifest = CourseManifest {
        course_name,
        slug: slug.to_string(),
        is_spec,
        photo_url: photo_url.clone(),
        tasks,
        total_files,
        total_size_est: 0,
    };

    // Also persist info in downloads_db
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut db = read_downloads_db();
    let existing = db.get(slug).cloned();
    let updated_info = CourseDownloadInfo {
        slug: slug.to_string(),
        course_name: manifest.course_name.clone(),
        path: existing.as_ref().map(|e| e.path.clone()).unwrap_or_default(),
        photo_url,
        total_files,
        downloaded_files: existing.as_ref().map(|e| e.downloaded_files).unwrap_or(0),
        total_bytes: existing.as_ref().map(|e| e.total_bytes).unwrap_or(0),
        downloaded_bytes: existing.as_ref().map(|e| e.downloaded_bytes).unwrap_or(0),
        percent: existing.as_ref().map(|e| e.percent).unwrap_or(0.0),
        status: existing.as_ref().map(|e| e.status.clone()).unwrap_or_else(|| "not_downloaded".to_string()),
        is_spec,
        is_completed: existing.as_ref().map(|e| e.is_completed).unwrap_or(false),
        last_updated: now,
    };
    db.insert(slug.to_string(), updated_info);
    write_downloads_db(&db);

    Ok(manifest)
}

struct ItemToProcess {
    course_id: String,
    root_folder: String,
    module_folder: String,
    lesson_folder: String,
    it_idx: usize,
    it_id: String,
    item_slug: String,
    item_name: String,
    content_type: String,
}

async fn probe_url_size(client: &reqwest::Client, url: &str) -> u64 {
    if url.starts_with("data:") {
        if let Some(data_part) = url.strip_prefix("data:text/html;charset=utf-8,") {
            let decoded = urlencoding::decode(data_part).unwrap_or(std::borrow::Cow::Borrowed(data_part));
            return decoded.len() as u64;
        }
        return 0;
    }

    // Fast HEAD request
    if let Ok(resp) = client.head(url).send().await {
        if resp.status().is_success() {
            if let Some(len) = resp.content_length() {
                if len > 0 {
                    return len;
                }
            }
        }
    }

    // Fallback: Range request bytes 0-0
    if let Ok(resp) = client.get(url).header("Range", "bytes=0-0").send().await {
        if let Some(range_header) = resp.headers().get("content-range").and_then(|h| h.to_str().ok()) {
            if let Some(total_str) = range_header.split('/').last() {
                if let Ok(total) = total_str.parse::<u64>() {
                    return total;
                }
            }
        }
        if let Some(len) = resp.content_length() {
            if len > 1 {
                return len;
            }
        }
    }

    0
}

async fn gather_course_items(
    client: &CourseraClient,
    course_slug: &str,
    root_folder: &str,
    prefix_sep: &str,
    max_resolution: Option<u32>,
    tasks: &mut Vec<DownloadTask>,
) -> Result<(), String> {
    // 1. Fetch course details to get ID
    let course_url = format!("{}/api/onDemandCourses.v1?q=slug&slug={}", COURSERA_BASE, course_slug);
    let resp = client.client().get(&course_url).send().await.map_err(|e| e.to_string())?;
    let course_info: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    
    let course_id = course_info.get("elements")
        .and_then(|e| e.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("id"))
        .and_then(|id| id.as_str())
        .ok_or_else(|| format!("Course '{}' not found or invalid", course_slug))?
        .to_string();

    // 2. Fetch course materials (modules, lessons, items)
    let mat_url = format!(
        "{}/api/onDemandCourseMaterials.v2/?q=slug&slug={}&includes=modules,lessons,items&fields=onDemandCourseMaterialModules.v1(name,slug,lessonIds),onDemandCourseMaterialLessons.v1(name,slug,itemIds),onDemandCourseMaterialItems.v2(name,slug,contentSummary)&showLockedItems=true",
        COURSERA_BASE, course_slug
    );
    let mat_resp = client.client().get(&mat_url).send().await.map_err(|e| e.to_string())?;
    let mat_data: serde_json::Value = mat_resp.json().await.map_err(|e| e.to_string())?;

    let mut item_map = std::collections::HashMap::new();
    if let Some(items) = mat_data.get("linked").and_then(|l| l.get("onDemandCourseMaterialItems.v2")).and_then(|i| i.as_array()) {
        for it in items {
            if let Some(id) = it.get("id").and_then(|id| id.as_str()) {
                item_map.insert(id.to_string(), it.clone());
            }
        }
    }

    let mut lesson_map = std::collections::HashMap::new();
    if let Some(lessons) = mat_data.get("linked").and_then(|l| l.get("onDemandCourseMaterialLessons.v1")).and_then(|les| les.as_array()) {
        for l in lessons {
            if let Some(id) = l.get("id").and_then(|id| id.as_str()) {
                lesson_map.insert(id.to_string(), l.clone());
            }
        }
    }

    let mut items_to_process = Vec::new();

    if let Some(modules) = mat_data.get("linked").and_then(|l| l.get("onDemandCourseMaterialModules.v1")).and_then(|m| m.as_array()) {
        for (m_idx, m) in modules.iter().enumerate() {
            let m_slug = m.get("slug").and_then(|s| s.as_str()).unwrap_or("module");
            let module_folder = format!("{:02}{}{}", m_idx + 1, prefix_sep, sanitize_name(m_slug));

            if let Some(lesson_ids) = m.get("lessonIds").and_then(|l| l.as_array()) {
                for (l_idx, l_id_val) in lesson_ids.iter().enumerate() {
                    let l_id = l_id_val.as_str().unwrap_or_default();
                    if let Some(lesson) = lesson_map.get(l_id) {
                        let l_slug = lesson.get("slug").and_then(|s| s.as_str()).unwrap_or("lesson");
                        let lesson_folder = format!("{:02}{}{}", l_idx + 1, prefix_sep, sanitize_name(l_slug));

                        if let Some(item_ids) = lesson.get("itemIds").and_then(|ids| ids.as_array()) {
                            for (it_idx, it_id_val) in item_ids.iter().enumerate() {
                                let it_id = it_id_val.as_str().unwrap_or_default();
                                if let Some(item) = item_map.get(it_id) {
                                    let item_slug = item.get("slug").and_then(|s| s.as_str()).unwrap_or("item");
                                    let item_name = item.get("name").and_then(|s| s.as_str()).unwrap_or(item_slug);
                                    let content_type = item.get("contentSummary").and_then(|c| c.get("typeName")).and_then(|t| t.as_str()).unwrap_or("");

                                    if content_type == "lecture" || content_type == "supplement" {
                                        items_to_process.push(ItemToProcess {
                                            course_id: course_id.clone(),
                                            root_folder: root_folder.to_string(),
                                            module_folder: module_folder.clone(),
                                            lesson_folder: lesson_folder.clone(),
                                            it_idx,
                                            it_id: it_id.to_string(),
                                            item_slug: item_slug.to_string(),
                                            item_name: item_name.to_string(),
                                            content_type: content_type.to_string(),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Process items concurrently with semaphore for high-speed manifest resolution
    let sem = Arc::new(tokio::sync::Semaphore::new(12));
    let mut futures = Vec::new();

    for item in items_to_process {
        let client_clone = client.clone();
        let sep = prefix_sep.to_string();
        let max_res_val = max_resolution;
        let permit = sem.clone().acquire_owned().await.unwrap();

        futures.push(tokio::spawn(async move {
            let _permit = permit;
            let mut sub_tasks = Vec::new();

            if item.content_type == "lecture" {
                let vid_url = format!(
                    "{}/api/onDemandLectureVideos.v1/{}~{}?includes=video&fields=onDemandVideos.v1(sources,subtitles)",
                    COURSERA_BASE, item.course_id, item.it_id
                );
                if let Ok(v_resp) = client_clone.client().get(&vid_url).send().await {
                    if let Ok(v_data) = v_resp.json::<serde_json::Value>().await {
                        if let Some(videos) = v_data.get("linked").and_then(|l| l.get("onDemandVideos.v1")).and_then(|v| v.as_array()) {
                            for (v_i, v_obj) in videos.iter().enumerate() {
                                if let Some(sources) = v_obj.get("sources").and_then(|s| s.get("byResolution")).and_then(|b| b.as_object()) {
                                    let mut res_keys: Vec<&String> = sources.keys().collect();
                                    res_keys.sort_by(|a, b| {
                                        let a_num: u32 = a.trim_end_matches('p').parse().unwrap_or(0);
                                        let b_num: u32 = b.trim_end_matches('p').parse().unwrap_or(0);
                                        a_num.cmp(&b_num)
                                    });

                                    let target_max_res = max_res_val.unwrap_or(720);
                                    let chosen_key = res_keys
                                        .iter()
                                        .filter(|k| {
                                            let num = k.trim_end_matches('p').parse::<u32>().unwrap_or(0);
                                            num <= target_max_res
                                        })
                                        .last()
                                        .copied()
                                        .or_else(|| res_keys.first().copied());

                                    if let Some(key) = chosen_key {
                                        if let Some(mp4_url) = sources.get(key.as_str()).and_then(|res| res.get("mp4VideoUrl")).and_then(|u| u.as_str()) {
                                            let file_label = format!("{:02}{}{}.mp4", item.it_idx + 1, sep, sanitize_name(&item.item_slug));
                                            let rel_path = format!("{}/{}/{}/{}", item.root_folder, item.module_folder, item.lesson_folder, file_label);
                                            let probed_size = probe_url_size(client_clone.client(), mp4_url).await;

                                            sub_tasks.push(DownloadTask {
                                                id: format!("{}-vid-{}", item.it_id, v_i),
                                                title: format!("{} ({})", item.item_name, key),
                                                url: mp4_url.to_string(),
                                                relative_path: rel_path,
                                                total_bytes: probed_size,
                                                downloaded_bytes: 0,
                                                status: TaskStatus::Pending,
                                                error: None,
                                            });
                                        }
                                    }
                                }
                                if let Some(sub_url) = v_obj.get("subtitles").and_then(|s| s.get("en")).and_then(|u| u.as_str()) {
                                    let sub_full_url = if sub_url.starts_with("http") { sub_url.to_string() } else { format!("{}{}", COURSERA_BASE, sub_url) };
                                    let file_label = format!("{:02}{}{}.srt", item.it_idx + 1, sep, sanitize_name(&item.item_slug));
                                    let rel_path = format!("{}/{}/{}/{}", item.root_folder, item.module_folder, item.lesson_folder, file_label);
                                    let probed_sub_size = probe_url_size(client_clone.client(), &sub_full_url).await;

                                    sub_tasks.push(DownloadTask {
                                        id: format!("{}-sub-{}", item.it_id, v_i),
                                        title: format!("{} (Subtitles)", item.item_name),
                                        url: sub_full_url,
                                        relative_path: rel_path,
                                        total_bytes: probed_sub_size,
                                        downloaded_bytes: 0,
                                        status: TaskStatus::Pending,
                                        error: None,
                                    });
                                }
                            }
                        }
                    }
                }
            } else if item.content_type == "supplement" {
                let supp_url = format!(
                    "{}/api/onDemandSupplements.v1/{}~{}?includes=asset&fields=openCourseAssets.v1(typeName,definition)",
                    COURSERA_BASE, item.course_id, item.it_id
                );
                if let Ok(s_resp) = client_clone.client().get(&supp_url).send().await {
                    if let Ok(s_data) = s_resp.json::<serde_json::Value>().await {
                        if let Some(assets) = s_data.get("linked").and_then(|l| l.get("openCourseAssets.v1")).and_then(|a| a.as_array()) {
                            for (a_i, a_obj) in assets.iter().enumerate() {
                                if let Some(def) = a_obj.get("definition") {
                                    if let Some(html_val) = def.get("value").and_then(|v| v.as_str()) {
                                        let file_label = format!("{:02}{}{}.html", item.it_idx + 1, sep, sanitize_name(&item.item_slug));
                                        let rel_path = format!("{}/{}/{}/{}", item.root_folder, item.module_folder, item.lesson_folder, file_label);
                                        
                                        let data_url = format!("data:text/html;charset=utf-8,{}", urlencoding::encode(html_val));
                                        sub_tasks.push(DownloadTask {
                                            id: format!("{}-supp-{}", item.it_id, a_i),
                                            title: format!("{} (Reading)", item.item_name),
                                            url: data_url,
                                            relative_path: rel_path,
                                            total_bytes: html_val.len() as u64,
                                            downloaded_bytes: 0,
                                            status: TaskStatus::Pending,
                                            error: None,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            sub_tasks
        }));
    }

    for f in futures {
        if let Ok(sub_tasks) = f.await {
            tasks.extend(sub_tasks);
        }
    }

    Ok(())
}

pub async fn check_existing_files(manifest: &mut CourseManifest, base_dir: &Path) {
    let mut downloaded_files = 0;
    let mut downloaded_bytes = 0u64;

    for task in manifest.tasks.iter_mut() {
        let target = base_dir.join(&task.relative_path);
        if target.exists() {
            if let Ok(meta) = fs::metadata(&target).await {
                let len = meta.len();
                if len > 0 {
                    if task.relative_path.ends_with(".html") || task.relative_path.ends_with(".srt") {
                        task.status = TaskStatus::Completed;
                        task.downloaded_bytes = len;
                        task.total_bytes = len;
                        downloaded_files += 1;
                        downloaded_bytes += len;
                    } else if len > 100_000 {
                        // For video, if file exists and is substantial, register bytes
                        task.downloaded_bytes = len;
                        if task.total_bytes == 0 {
                            task.total_bytes = len;
                        }
                        task.status = TaskStatus::Completed;
                        downloaded_files += 1;
                        downloaded_bytes += len;
                    }
                }
            }
        }
    }

    let total = manifest.tasks.len();
    let course_dir = base_dir.join(&manifest.course_name);
    let percent = if total > 0 {
        ((downloaded_files as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let is_completed = total > 0 && downloaded_files >= total;
    let status = if downloaded_files == 0 {
        "not_downloaded".to_string()
    } else if is_completed {
        "completed".to_string()
    } else {
        "partially_downloaded".to_string()
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let info = CourseDownloadInfo {
        slug: manifest.slug.clone(),
        course_name: manifest.course_name.clone(),
        path: course_dir.to_string_lossy().to_string(),
        photo_url: manifest.photo_url.clone(),
        total_files: total,
        downloaded_files,
        total_bytes: manifest.total_size_est,
        downloaded_bytes,
        percent,
        status,
        is_spec: manifest.is_spec,
        is_completed,
        last_updated: now,
    };
    save_or_update_course_download_info(info);
}

pub async fn download_single_task(
    client: &CourseraClient,
    task: &mut DownloadTask,
    base_dir: &Path,
    app_handle: Option<&AppHandle>,
    overall_completed: usize,
    overall_total: usize,
) -> Result<(), String> {
    let target_path = base_dir.join(&task.relative_path);
    if let Some(parent) = target_path.parent() {
        if let Err(e) = fs::create_dir_all(parent).await {
            let err = format!("Failed to create directory {:?}: {}", parent, e);
            task.status = TaskStatus::Failed;
            task.error = Some(err.clone());
            if let Some(app) = app_handle {
                let _ = app.emit("download_progress", DownloadProgressEvent {
                    task_id: task.id.clone(),
                    status: TaskStatus::Failed,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    progress_percent: 0.0,
                    current_file: task.title.clone(),
                    overall_completed,
                    overall_total,
                    error: Some(err.clone()),
                });
            }
            return Err(err);
        }
    }

    // 1. Check if HTML / Data URL
    if task.url.starts_with("data:") {
        if let Some(data_part) = task.url.strip_prefix("data:text/html;charset=utf-8,") {
            let decoded = urlencoding::decode(data_part).unwrap_or(std::borrow::Cow::Borrowed(data_part));
            let expected_bytes = decoded.len() as u64;

            // If file already exists and is non-empty, skip
            if target_path.exists() {
                if let Ok(meta) = fs::metadata(&target_path).await {
                    if meta.len() > 0 {
                        task.downloaded_bytes = meta.len();
                        task.total_bytes = meta.len();
                        task.status = TaskStatus::Completed;
                        if let Some(app) = app_handle {
                            let _ = app.emit("download_progress", DownloadProgressEvent {
                                task_id: task.id.clone(),
                                status: TaskStatus::Completed,
                                downloaded_bytes: meta.len(),
                                total_bytes: meta.len(),
                                progress_percent: 100.0,
                                current_file: task.title.clone(),
                                overall_completed: overall_completed + 1,
                                overall_total,
                                error: None,
                            });
                        }
                        return Ok(());
                    }
                }
            }

            if let Err(e) = fs::write(&target_path, decoded.as_bytes()).await {
                let err = format!("Failed to write HTML file: {}", e);
                task.status = TaskStatus::Failed;
                task.error = Some(err.clone());
                if let Some(app) = app_handle {
                    let _ = app.emit("download_progress", DownloadProgressEvent {
                        task_id: task.id.clone(),
                        status: TaskStatus::Failed,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        progress_percent: 0.0,
                        current_file: task.title.clone(),
                        overall_completed,
                        overall_total,
                        error: Some(err.clone()),
                    });
                }
                return Err(err);
            }
            task.downloaded_bytes = expected_bytes;
            task.total_bytes = expected_bytes;
            task.status = TaskStatus::Completed;

            if let Some(app) = app_handle {
                let _ = app.emit("download_progress", DownloadProgressEvent {
                    task_id: task.id.clone(),
                    status: TaskStatus::Completed,
                    downloaded_bytes: expected_bytes,
                    total_bytes: expected_bytes,
                    progress_percent: 100.0,
                    current_file: task.title.clone(),
                    overall_completed: overall_completed + 1,
                    overall_total,
                    error: None,
                });
            }
            return Ok(());
        }
    }

    // 2. For Subtitles (.srt), if file exists and has content, skip
    if task.relative_path.ends_with(".srt") && target_path.exists() {
        if let Ok(meta) = fs::metadata(&target_path).await {
            if meta.len() > 10 {
                task.downloaded_bytes = meta.len();
                task.total_bytes = meta.len();
                task.status = TaskStatus::Completed;
                if let Some(app) = app_handle {
                    let _ = app.emit("download_progress", DownloadProgressEvent {
                        task_id: task.id.clone(),
                        status: TaskStatus::Completed,
                        downloaded_bytes: meta.len(),
                        total_bytes: meta.len(),
                        progress_percent: 100.0,
                        current_file: task.title.clone(),
                        overall_completed: overall_completed + 1,
                        overall_total,
                        error: None,
                    });
                }
                return Ok(());
            }
        }
    }

    // 3. For Video/General HTTP downloads: Check existing file size for resume/skip
    let mut existing_len: u64 = 0;
    if target_path.exists() {
        if let Ok(meta) = fs::metadata(&target_path).await {
            existing_len = meta.len();
        }
    }

    task.status = TaskStatus::Downloading;
    task.downloaded_bytes = existing_len;

    // Emit initial Downloading state
    if let Some(app) = app_handle {
        let percent = if task.total_bytes > 0 {
            (existing_len as f64 / task.total_bytes as f64) * 100.0
        } else {
            0.0
        };
        let _ = app.emit("download_progress", DownloadProgressEvent {
            task_id: task.id.clone(),
            status: TaskStatus::Downloading,
            downloaded_bytes: existing_len,
            total_bytes: task.total_bytes,
            progress_percent: percent,
            current_file: task.title.clone(),
            overall_completed,
            overall_total,
            error: None,
        });
    }

    // Build HTTP request, adding Range header if file already partially exists
    let mut req = client.client().get(&task.url);
    if existing_len > 0 {
        req = req.header("Range", format!("bytes={}-", existing_len));
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let err = format!("Network request failed: {}", e);
            task.status = TaskStatus::Failed;
            task.error = Some(err.clone());
            if let Some(app) = app_handle {
                let _ = app.emit("download_progress", DownloadProgressEvent {
                    task_id: task.id.clone(),
                    status: TaskStatus::Failed,
                    downloaded_bytes: existing_len,
                    total_bytes: task.total_bytes,
                    progress_percent: 0.0,
                    current_file: task.title.clone(),
                    overall_completed,
                    overall_total,
                    error: Some(err.clone()),
                });
            }
            return Err(err);
        }
    };

    let status = resp.status();

    // 416 Range Not Satisfiable -> File is already fully downloaded!
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        task.downloaded_bytes = existing_len;
        task.total_bytes = existing_len;
        task.status = TaskStatus::Completed;
        if let Some(app) = app_handle {
            let _ = app.emit("download_progress", DownloadProgressEvent {
                task_id: task.id.clone(),
                status: TaskStatus::Completed,
                downloaded_bytes: existing_len,
                total_bytes: existing_len,
                progress_percent: 100.0,
                current_file: task.title.clone(),
                overall_completed: overall_completed + 1,
                overall_total,
                error: None,
            });
        }
        return Ok(());
    }

    if !status.is_success() {
        let err = format!("HTTP error: {}", status);
        task.status = TaskStatus::Failed;
        task.error = Some(err.clone());
        if let Some(app) = app_handle {
            let _ = app.emit("download_progress", DownloadProgressEvent {
                task_id: task.id.clone(),
                status: TaskStatus::Failed,
                downloaded_bytes: existing_len,
                total_bytes: task.total_bytes,
                progress_percent: 0.0,
                current_file: task.title.clone(),
                overall_completed,
                overall_total,
                error: Some(err.clone()),
            });
        }
        return Err(err);
    }

    let is_partial = status == reqwest::StatusCode::PARTIAL_CONTENT;
    let content_len = resp.content_length().unwrap_or(0);
    let total_len = if is_partial {
        existing_len + content_len
    } else {
        content_len
    };

    // If server returned 200 (not partial) and existing_len == content_len > 0, file is complete
    if !is_partial && existing_len > 0 && existing_len == content_len {
        task.downloaded_bytes = existing_len;
        task.total_bytes = existing_len;
        task.status = TaskStatus::Completed;
        if let Some(app) = app_handle {
            let _ = app.emit("download_progress", DownloadProgressEvent {
                task_id: task.id.clone(),
                status: TaskStatus::Completed,
                downloaded_bytes: existing_len,
                total_bytes: existing_len,
                progress_percent: 100.0,
                current_file: task.title.clone(),
                overall_completed: overall_completed + 1,
                overall_total,
                error: None,
            });
        }
        return Ok(());
    }

    task.total_bytes = total_len;
    task.downloaded_bytes = if is_partial { existing_len } else { 0 };

    let mut file = if is_partial {
        match tokio::fs::OpenOptions::new().write(true).append(true).open(&target_path).await {
            Ok(f) => f,
            Err(e) => {
                let err = format!("Failed to open file for resume {:?}: {}", target_path, e);
                task.status = TaskStatus::Failed;
                task.error = Some(err.clone());
                return Err(err);
            }
        }
    } else {
        match File::create(&target_path).await {
            Ok(f) => f,
            Err(e) => {
                let err = format!("Failed to create target file {:?}: {}", target_path, e);
                task.status = TaskStatus::Failed;
                task.error = Some(err.clone());
                if let Some(app) = app_handle {
                    let _ = app.emit("download_progress", DownloadProgressEvent {
                        task_id: task.id.clone(),
                        status: TaskStatus::Failed,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        progress_percent: 0.0,
                        current_file: task.title.clone(),
                        overall_completed,
                        overall_total,
                        error: Some(err.clone()),
                    });
                }
                return Err(err);
            }
        }
    };

    let mut stream = resp.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let err = format!("Stream read error: {}", e);
                task.status = TaskStatus::Failed;
                task.error = Some(err.clone());
                if let Some(app) = app_handle {
                    let _ = app.emit("download_progress", DownloadProgressEvent {
                        task_id: task.id.clone(),
                        status: TaskStatus::Failed,
                        downloaded_bytes: task.downloaded_bytes,
                        total_bytes: task.total_bytes,
                        progress_percent: 0.0,
                        current_file: task.title.clone(),
                        overall_completed,
                        overall_total,
                        error: Some(err.clone()),
                    });
                }
                return Err(err);
            }
        };

        if let Err(e) = file.write_all(&chunk).await {
            let err = format!("Disk write error: {}", e);
            task.status = TaskStatus::Failed;
            task.error = Some(err.clone());
            if let Some(app) = app_handle {
                let _ = app.emit("download_progress", DownloadProgressEvent {
                    task_id: task.id.clone(),
                    status: TaskStatus::Failed,
                    downloaded_bytes: task.downloaded_bytes,
                    total_bytes: task.total_bytes,
                    progress_percent: 0.0,
                    current_file: task.title.clone(),
                    overall_completed,
                    overall_total,
                    error: Some(err.clone()),
                });
            }
            return Err(err);
        }
        task.downloaded_bytes += chunk.len() as u64;

        if let Some(app) = app_handle {
            if last_emit.elapsed() >= std::time::Duration::from_millis(100) || task.downloaded_bytes == task.total_bytes {
                last_emit = std::time::Instant::now();
                let percent = if task.total_bytes > 0 {
                    (task.downloaded_bytes as f64 / task.total_bytes as f64) * 100.0
                } else {
                    0.0
                };
                let _ = app.emit("download_progress", DownloadProgressEvent {
                    task_id: task.id.clone(),
                    status: TaskStatus::Downloading,
                    downloaded_bytes: task.downloaded_bytes,
                    total_bytes: task.total_bytes,
                    progress_percent: percent,
                    current_file: task.title.clone(),
                    overall_completed,
                    overall_total,
                    error: None,
                });
            }
        }
    }

    if let Err(e) = file.flush().await {
        let err = format!("Flush error: {}", e);
        task.status = TaskStatus::Failed;
        task.error = Some(err.clone());
        if let Some(app) = app_handle {
            let _ = app.emit("download_progress", DownloadProgressEvent {
                task_id: task.id.clone(),
                status: TaskStatus::Failed,
                downloaded_bytes: task.downloaded_bytes,
                total_bytes: task.total_bytes,
                progress_percent: 0.0,
                current_file: task.title.clone(),
                overall_completed,
                overall_total,
                error: Some(err.clone()),
            });
        }
        return Err(err);
    }

    task.status = TaskStatus::Completed;

    if let Some(app) = app_handle {
        let _ = app.emit("download_progress", DownloadProgressEvent {
            task_id: task.id.clone(),
            status: TaskStatus::Completed,
            downloaded_bytes: task.downloaded_bytes,
            total_bytes: task.total_bytes,
            progress_percent: 100.0,
            current_file: task.title.clone(),
            overall_completed: overall_completed + 1,
            overall_total,
            error: None,
        });
    }

    Ok(())
}

pub fn get_downloads_db_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("coursera-studio");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("downloads_db.json"))
}

pub fn read_downloads_db() -> std::collections::HashMap<String, CourseDownloadInfo> {
    if let Ok(path) = get_downloads_db_path() {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(db) = serde_json::from_str::<std::collections::HashMap<String, CourseDownloadInfo>>(&content) {
                    return db;
                }
            }
        }
    }
    std::collections::HashMap::new()
}

pub fn write_downloads_db(db: &std::collections::HashMap<String, CourseDownloadInfo>) {
    if let Ok(path) = get_downloads_db_path() {
        if let Ok(content) = serde_json::to_string_pretty(db) {
            let _ = std::fs::write(&path, content);
        }
    }
}

pub fn save_or_update_course_download_info(info: CourseDownloadInfo) {
    let mut db = read_downloads_db();
    db.insert(info.slug.clone(), info);
    write_downloads_db(&db);
}

pub fn scan_dir_recursive(path: &Path) -> (usize, u64) {
    let mut count = 0;
    let mut bytes = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let (sub_cnt, sub_bytes) = scan_dir_recursive(&p);
                count += sub_cnt;
                bytes += sub_bytes;
            } else if p.is_file() {
                if let Ok(meta) = entry.metadata() {
                    let len = meta.len();
                    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                        if !name.starts_with('.') && len > 0 {
                            count += 1;
                            bytes += len;
                        }
                    }
                }
            }
        }
    }
    (count, bytes)
}

pub fn get_course_download_status_on_disk(slug: &str, base_dir: &Path) -> CourseDownloadInfo {
    let course_name = sanitize_name(slug);
    let mut course_dir = base_dir.join(&course_name);

    // If direct folder doesn't exist, search if this course is part of an already downloaded specialization folder
    if (!course_dir.exists() || !course_dir.is_dir()) && base_dir.exists() && base_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(base_dir) {
            'outer: for entry in entries.flatten() {
                let spec_path = entry.path();
                if spec_path.is_dir() {
                    if let Ok(sub_entries) = std::fs::read_dir(&spec_path) {
                        for sub in sub_entries.flatten() {
                            let sub_p = sub.path();
                            if sub_p.is_dir() {
                                let sub_name = sub.file_name().to_string_lossy().to_string();
                                // Match prefix patterns like "01 - slug" or "slug"
                                if sub_name == course_name 
                                    || sub_name.ends_with(&format!(" - {}", course_name))
                                    || sub_name.ends_with(&format!("-{}", course_name))
                                    || sub_name.contains(&course_name) {
                                    course_dir = sub_p;
                                    break 'outer;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let db = read_downloads_db();
    let db_info = db.get(slug).cloned();

    let (files_on_disk, bytes_on_disk) = if course_dir.exists() && course_dir.is_dir() {
        scan_dir_recursive(&course_dir)
    } else {
        (0, 0)
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let info = if let Some(mut existing) = db_info {
        if files_on_disk > 0 {
            let total = existing.total_files.max(files_on_disk);
            existing.total_files = total;
            existing.downloaded_files = files_on_disk;
            existing.downloaded_bytes = bytes_on_disk;
            existing.percent = if total > 0 {
                ((files_on_disk as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
            } else {
                100.0
            };
            existing.is_completed = existing.percent >= 100.0 || (existing.total_files > 0 && files_on_disk >= existing.total_files);
            existing.status = if existing.is_completed {
                "completed".to_string()
            } else {
                "partially_downloaded".to_string()
            };
        } else {
            existing.downloaded_files = 0;
            existing.downloaded_bytes = 0;
            existing.percent = 0.0;
            existing.is_completed = false;
            existing.status = "not_downloaded".to_string();
        }
        existing.path = course_dir.to_string_lossy().to_string();
        existing.last_updated = now;
        existing
    } else if files_on_disk > 0 {
        CourseDownloadInfo {
            slug: slug.to_string(),
            course_name: course_name.clone(),
            path: course_dir.to_string_lossy().to_string(),
            photo_url: db_info.as_ref().and_then(|d| d.photo_url.clone()),
            total_files: files_on_disk,
            downloaded_files: files_on_disk,
            total_bytes: bytes_on_disk,
            downloaded_bytes: bytes_on_disk,
            percent: 100.0,
            status: "completed".to_string(),
            is_spec: false,
            is_completed: true,
            last_updated: now,
        }
    } else {
        CourseDownloadInfo {
            slug: slug.to_string(),
            course_name: course_name.clone(),
            path: course_dir.to_string_lossy().to_string(),
            photo_url: db_info.as_ref().and_then(|d| d.photo_url.clone()),
            total_files: 0,
            downloaded_files: 0,
            total_bytes: 0,
            downloaded_bytes: 0,
            percent: 0.0,
            status: "not_downloaded".to_string(),
            is_spec: false,
            is_completed: false,
            last_updated: now,
        }
    };

    save_or_update_course_download_info(info.clone());
    info
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadedItem {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub path: String,
    pub photo_url: Option<String>,
    pub is_spec: bool,
    pub total_files: usize,
    pub downloaded_files: usize,
    pub downloaded_bytes: u64,
    pub percent: f64,
    pub status: String, // "completed" | "partially_downloaded"
    pub sub_courses: Vec<String>,
    pub last_modified: u64,
}

pub async fn get_all_downloaded_items(base_dir: &Path, _client: Option<&CourseraClient>) -> Vec<DownloadedItem> {
    let mut items = Vec::new();
    let mut db = read_downloads_db();
    let mut db_modified = false;
    let mut visited_paths = std::collections::HashSet::new();

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_default();

    if base_dir.exists() && base_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(base_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    if folder_name.starts_with('.') {
                        continue;
                    }

                    visited_paths.insert(p.to_string_lossy().to_string());

                    let mut sub_courses = Vec::new();
                    let mut is_spec = false;

                    if let Ok(sub_entries) = std::fs::read_dir(&p) {
                        for sub in sub_entries.flatten() {
                            let sub_p = sub.path();
                            if sub_p.is_dir() {
                                let sub_name = sub.file_name().to_string_lossy().to_string();
                                if !sub_name.starts_with('.') {
                                    let mut has_nested_subfolders = false;
                                    if let Ok(deep_entries) = std::fs::read_dir(&sub_p) {
                                        for deep in deep_entries.flatten() {
                                            let deep_p = deep.path();
                                            if deep_p.is_dir() {
                                                if let Ok(lesson_entries) = std::fs::read_dir(&deep_p) {
                                                    for lesson in lesson_entries.flatten() {
                                                        if lesson.path().is_dir() {
                                                            has_nested_subfolders = true;
                                                            break;
                                                        }
                                                    }
                                                }
                                                if has_nested_subfolders {
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    if has_nested_subfolders {
                                        sub_courses.push(sub_name);
                                    }
                                }
                            }
                        }
                    }
                    sub_courses.sort();
                    if sub_courses.len() >= 2 {
                        is_spec = true;
                    }

                    let (files_count, total_bytes) = scan_dir_recursive(&p);
                    if files_count == 0 {
                        continue;
                    }

                    let last_modified = entry.metadata()
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or_default();

                    let norm_folder = folder_name.to_lowercase().replace('_', "-");
                    let clean_slug = norm_folder.trim_start_matches(|c: char| c.is_numeric() || c == ' ' || c == '-').trim().to_string();

                    // Check if DB has manifest info (fuzzy match across normalized slugs and course names)
                    let db_match_key = db.keys().find(|k| {
                        let norm_k = k.to_lowercase().replace('_', "-");
                        norm_k == norm_folder || norm_k == clean_slug || norm_folder.ends_with(&norm_k)
                    }).cloned();

                    let db_info = db_match_key.and_then(|k| db.get(&k).cloned());

                    let (total_files, percent, is_completed, mut photo_url) = if let Some(ref d) = db_info {
                        let total = d.total_files.max(files_count);
                        let pct = if total > 0 { ((files_count as f64 / total as f64) * 100.0).clamp(0.0, 100.0) } else { 100.0 };
                        let comp = pct >= 100.0 || (d.total_files > 0 && files_count >= d.total_files);
                        (total, pct, comp, d.photo_url.clone())
                    } else {
                        (files_count, 100.0, true, None)
                    };

                    // If photo_url is missing, query public Coursera API to fetch it
                    if photo_url.is_none() {
                        let candidate_slug = if !clean_slug.is_empty() { &clean_slug } else { &norm_folder };

                        // First try specialization if is_spec
                        if is_spec {
                            let s_url = format!("{}/api/onDemandSpecializations.v1?q=slug&slug={}&fields=photoUrl,promoPhoto,logo", COURSERA_BASE, candidate_slug);
                            if let Ok(resp) = http_client.get(&s_url).send().await {
                                if let Ok(s_data) = resp.json::<serde_json::Value>().await {
                                    if let Some(el) = s_data.get("elements").and_then(|e| e.as_array()).and_then(|a| a.first()) {
                                        photo_url = el.get("photoUrl")
                                            .or_else(|| el.get("promoPhoto"))
                                            .or_else(|| el.get("logo"))
                                            .and_then(|p| p.as_str())
                                            .map(String::from);
                                    }
                                }
                            }
                        }

                        // Fallback or single course lookup
                        if photo_url.is_none() {
                            let c_url = format!("{}/api/onDemandCourses.v1?q=slug&slug={}&fields=photoUrl,promoPhoto", COURSERA_BASE, candidate_slug);
                            if let Ok(resp) = http_client.get(&c_url).send().await {
                                if let Ok(c_data) = resp.json::<serde_json::Value>().await {
                                    if let Some(el) = c_data.get("elements").and_then(|e| e.as_array()).and_then(|a| a.first()) {
                                        photo_url = el.get("photoUrl")
                                            .or_else(|| el.get("promoPhoto"))
                                            .and_then(|p| p.as_str())
                                            .map(String::from);
                                    }
                                }
                            }
                        }

                        // If found photo, persist to DB for instant lookup next time
                        if let Some(ref purl) = photo_url {
                            let key = if let Some(ref d) = db_info { d.slug.clone() } else { candidate_slug.to_string() };
                            let mut updated = db_info.unwrap_or_else(|| CourseDownloadInfo {
                                slug: key.clone(),
                                course_name: folder_name.clone(),
                                path: p.to_string_lossy().to_string(),
                                photo_url: None,
                                total_files,
                                downloaded_files: files_count,
                                total_bytes,
                                downloaded_bytes: total_bytes,
                                percent,
                                status: if is_completed { "completed".to_string() } else { "partially_downloaded".to_string() },
                                is_spec,
                                is_completed,
                                last_updated: last_modified,
                            });
                            updated.photo_url = Some(purl.clone());
                            db.insert(key, updated);
                            db_modified = true;
                        }
                    }

                    let title = folder_name.replace('_', " ").replace('-', " ");
                    let formatted_title = title
                        .split_whitespace()
                        .map(|w| {
                            let mut c = w.chars();
                            match c.next() {
                                None => String::new(),
                                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" ");

                    items.push(DownloadedItem {
                        id: folder_name.clone(),
                        title: formatted_title,
                        slug: folder_name.clone(),
                        path: p.to_string_lossy().to_string(),
                        photo_url,
                        is_spec,
                        total_files,
                        downloaded_files: files_count,
                        downloaded_bytes: total_bytes,
                        percent,
                        status: if is_completed { "completed".to_string() } else { "partially_downloaded".to_string() },
                        sub_courses,
                        last_modified,
                    });
                }
            }
        }
    }

    if db_modified {
        write_downloads_db(&db);
    }

    // Sort items by last_modified descending
    items.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    items
}



