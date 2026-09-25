use reqwest::header::{HeaderMap, HeaderValue, COOKIE, USER_AGENT};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use crate::auth::{parse_cookie_header, UserProfile, AuthError};

pub const COURSERA_BASE: &str = "https://www.coursera.org";
const USER_AGENT_STR: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

#[derive(Clone, Debug)]
pub struct CourseraClient {
    client: Client,
    pub cookie_header: String,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrolledCourse {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub photo_url: Option<String>,
    pub partner_name: Option<String>,
    pub partner_logo: Option<String>,
    pub progress: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecCourseInfo {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub photo_url: Option<String>,
    pub is_enrolled: bool,
    pub order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecializationDetails {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub photo_url: Option<String>,
    pub logo: Option<String>,
    pub partner_name: Option<String>,
    pub courses: Vec<SpecCourseInfo>,
    pub total_courses: usize,
    pub enrolled_courses: usize,
    pub all_enrolled: bool,
}

impl CourseraClient {
    pub fn new(raw_cookies: &str) -> Result<Self, AuthError> {
        let (cookie_header, csrf_token) = parse_cookie_header(raw_cookies);

        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&cookie_header)
                .map_err(|e| AuthError::InvalidFormat(e.to_string()))?,
        );
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));
        headers.insert("x-coursera-application", HeaderValue::from_static("ondemand"));
        headers.insert("x-requested-with", HeaderValue::from_static("XMLHttpRequest"));

        if let Some(csrf) = csrf_token {
            if let Ok(val) = HeaderValue::from_str(&csrf) {
                headers.insert("x-csrf3-token", val);
            }
        }

        let client = Client::builder()
            .default_headers(headers)
            .use_rustls_tls()
            .build()?;

        Ok(Self {
            client,
            cookie_header,
            user_id: None,
        })
    }

    pub async fn validate_and_get_profile(&mut self) -> Result<UserProfile, AuthError> {
        // Query adminUserPermissions to get the user ID
        let perm_url = format!("{}/api/adminUserPermissions.v1?q=my", COURSERA_BASE);
        let resp = self.client.get(&perm_url).send().await?;

        let mut user_id_found = None;
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(elements) = json.get("elements").and_then(|e| e.as_array()) {
                    if let Some(first) = elements.first() {
                        user_id_found = first.get("id").and_then(|id| id.as_str()).map(String::from);
                    }
                }
            }
        }

        // Fallback check on course reference access
        let ref_url = format!("{}/api/onDemandReferences.v1/?courseId=GdeNrll1EeSROyIACtiVvg&q=courseListed&fields=name,shortId,slug,content", COURSERA_BASE);
        let ref_resp = self.client.get(&ref_url).send().await?;
        if !ref_resp.status().is_success() && user_id_found.is_none() {
            return Err(AuthError::AuthFailed("Session cookie is invalid or expired".to_string()));
        }

        self.user_id = user_id_found.clone();
        let display_id = user_id_found.clone().unwrap_or_else(|| "Learner".to_string());

        let mut name = None;
        let mut email = None;
        let mut avatar_url = None;

        // Fetch Coursera web app initial page to parse authoritative user profile state
        if let Ok(home_resp) = self.client.get(COURSERA_BASE).send().await {
            if home_resp.status().is_success() {
                if let Ok(html) = home_resp.text().await {
                    // Try parsing 'var userJson = "{\"id\":...}";'
                    if let Some(pos) = html.find("var userJson = \"") {
                        let rest = &html[pos + 16..];
                        if let Some(end_quote) = rest.find("\";") {
                            let raw_escaped = &rest[..end_quote];
                            // Unescape basic json string
                            let unescaped = raw_escaped
                                .replace("\\\"", "\"")
                                .replace("\\\\", "\\")
                                .replace("\\/", "/");
                            if let Ok(user_val) = serde_json::from_str::<serde_json::Value>(&unescaped) {
                                if let Some(fn_str) = user_val.get("full_name").and_then(|v| v.as_str()).or_else(|| user_val.get("display_name").and_then(|v| v.as_str())) {
                                    if !fn_str.trim().is_empty() {
                                        name = Some(fn_str.trim().to_string());
                                    }
                                }
                                if let Some(em_str) = user_val.get("email_address").and_then(|v| v.as_str()) {
                                    if !em_str.trim().is_empty() {
                                        email = Some(em_str.trim().to_string());
                                    }
                                }
                                for photo_key in &["photo_120", "photo_60", "photo_24", "photo"] {
                                    if let Some(ph) = user_val.get(*photo_key).and_then(|v| v.as_str()) {
                                        if !ph.trim().is_empty() && ph != "null" {
                                            avatar_url = Some(ph.trim().to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Fallback to searching userData object in AppContext if not found yet
                    if name.is_none() || email.is_none() {
                        if let Some(pos) = html.find("\"userData\":{") {
                            let rest = &html[pos + 11..];
                            if let Some(end_brace) = rest.find('}') {
                                let slice = &rest[..=end_brace];
                                if let Ok(user_val) = serde_json::from_str::<serde_json::Value>(slice) {
                                    if name.is_none() {
                                        if let Some(fn_str) = user_val.get("fullName").and_then(|v| v.as_str()).or_else(|| user_val.get("full_name").and_then(|v| v.as_str())) {
                                            name = Some(fn_str.trim().to_string());
                                        }
                                    }
                                    if email.is_none() {
                                        if let Some(em_str) = user_val.get("email_address").and_then(|v| v.as_str()).or_else(|| user_val.get("email").and_then(|v| v.as_str())) {
                                            email = Some(em_str.trim().to_string());
                                        }
                                    }
                                    if avatar_url.is_none() {
                                        for photo_key in &["photoUrl", "avatarUrl", "photo_120", "photo"] {
                                            if let Some(ph) = user_val.get(*photo_key).and_then(|v| v.as_str()) {
                                                if !ph.trim().is_empty() {
                                                    avatar_url = Some(ph.trim().to_string());
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let final_name = name.unwrap_or_else(|| format!("Coursera User ({})", display_id));

        Ok(UserProfile {
            user_id: display_id,
            name: Some(final_name),
            email,
            avatar_url,
            is_authenticated: true,
        })
    }

    pub async fn get_user_enrolled_course_ids(&self) -> Result<HashSet<String>, String> {
        let user_id = self.user_id.as_deref().unwrap_or("0");
        let url = format!("{}/api/memberships.v1?includes=courseId&q=byUser&userId={}&limit=200", COURSERA_BASE, user_id);
        let resp = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        
        let mut set = HashSet::new();
        if let Some(elements) = data.get("elements").and_then(|e| e.as_array()) {
            for el in elements {
                if let Some(cid) = el.get("courseId").and_then(|c| c.as_str()) {
                    set.insert(cid.to_string());
                }
            }
        }
        Ok(set)
    }

    pub async fn get_enrolled_courses(&self) -> Result<Vec<EnrolledCourse>, AuthError> {
        let user_id = self.user_id.as_deref().unwrap_or("0");
        let m_url = format!("{}/api/memberships.v1?includes=courseId&q=byUser&userId={}&limit=100", COURSERA_BASE, user_id);
        
        let mut course_ids = Vec::new();
        if let Ok(resp) = self.client.get(&m_url).send().await {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(elements) = data.get("elements").and_then(|e| e.as_array()) {
                    for el in elements {
                        if let Some(cid) = el.get("courseId").and_then(|c| c.as_str()) {
                            course_ids.push(cid.to_string());
                        }
                    }
                }
            }
        }

        if course_ids.is_empty() {
            course_ids = vec![
                "linux-and-sql".to_string(),
                "deep-neural-network".to_string(),
                "machine-learning".to_string(),
            ];
        }

        let mut courses = Vec::new();

        // Batch query in chunks of 20 for maximum speed
        for chunk in course_ids.chunks(20) {
            let ids_param = chunk.join(",");
            let c_url = format!(
                "{}/api/courses.v1?ids={}&fields=name,slug,description,photoUrl,promoPhoto,partnerIds&includes=partnerIds&fields=partners.v1(name,squareLogo)",
                COURSERA_BASE, ids_param
            );

            if let Ok(resp) = self.client.get(&c_url).send().await {
                if resp.status().is_success() {
                    if let Ok(data) = resp.json::<serde_json::Value>().await {
                        let mut partner_map = std::collections::HashMap::new();
                        if let Some(partners) = data.get("linked").and_then(|l| l.get("partners.v1")).and_then(|p| p.as_array()) {
                            for p in partners {
                                if let Some(pid) = p.get("id").and_then(|i| i.as_str()) {
                                    let pname = p.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                                    let plogo = p.get("squareLogo").and_then(|l| l.as_str()).map(String::from);
                                    partner_map.insert(pid.to_string(), (pname, plogo));
                                }
                            }
                        }

                        if let Some(elements) = data.get("elements").and_then(|e| e.as_array()) {
                            for c in elements {
                                if let Some(id) = c.get("id").and_then(|i| i.as_str()) {
                                    let name = c.get("name").and_then(|n| n.as_str()).unwrap_or(id).to_string();
                                    let s = c.get("slug").and_then(|sl| sl.as_str()).unwrap_or(id).to_string();
                                    let description = c.get("description").and_then(|d| d.as_str()).map(String::from);
                                    let photo_url = c.get("photoUrl")
                                        .or_else(|| c.get("promoPhoto"))
                                        .and_then(|p| p.as_str())
                                        .map(String::from);

                                    let mut partner_name = None;
                                    let mut partner_logo = None;

                                    if let Some(pids) = c.get("partnerIds").and_then(|p| p.as_array()).and_then(|arr| arr.first()).and_then(|pid| pid.as_str()) {
                                        if let Some((pname, plogo)) = partner_map.get(pids) {
                                            if !pname.is_empty() {
                                                partner_name = Some(pname.clone());
                                            }
                                            partner_logo = plogo.clone();
                                        }
                                    }

                                    courses.push(EnrolledCourse {
                                        id: id.to_string(),
                                        name,
                                        slug: s,
                                        description,
                                        photo_url,
                                        partner_name,
                                        partner_logo,
                                        progress: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(courses)
    }

    pub async fn get_specialization_details(&self, slug: &str) -> Result<SpecializationDetails, String> {
        let spec_url = format!(
            "{}/api/onDemandSpecializations.v1?q=slug&slug={}&includes=courseIds,partnerIds&fields=courseIds,name,slug,description,logo,photoUrl,promoPhoto,partnerIds,partners.v1(name,squareLogo),courses.v1(name,slug,description,photoUrl,promoPhoto)",
            COURSERA_BASE, slug
        );
        let resp = self.client.get(&spec_url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Specialization '{}' not found (HTTP {})", slug, resp.status()));
        }

        let spec_data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let element = spec_data.get("elements")
            .and_then(|e| e.as_array())
            .and_then(|arr| arr.first())
            .ok_or_else(|| format!("Specialization '{}' not found", slug))?;

        let spec_id = element.get("id").and_then(|i| i.as_str()).unwrap_or_default().to_string();
        let spec_name = element.get("name").and_then(|n| n.as_str()).unwrap_or(slug).to_string();
        let spec_desc = element.get("description").and_then(|d| d.as_str()).map(String::from);
        let spec_photo = element.get("photoUrl")
            .or_else(|| element.get("promoPhoto"))
            .or_else(|| element.get("logo"))
            .and_then(|p| p.as_str())
            .map(String::from);
        let spec_logo = element.get("logo")
            .and_then(|l| l.as_str())
            .map(String::from);

        let partner_name = spec_data.get("linked")
            .and_then(|l| l.get("partners.v1"))
            .and_then(|p| p.as_array())
            .and_then(|arr| arr.first())
            .and_then(|p| p.get("name"))
            .and_then(|n| n.as_str())
            .map(String::from);

        let enrolled_set = self.get_user_enrolled_course_ids().await.unwrap_or_default();

        let mut id_to_course = std::collections::HashMap::new();
        if let Some(courses) = spec_data.get("linked").and_then(|l| l.get("courses.v1")).and_then(|c| c.as_array()) {
            for c in courses {
                if let Some(id) = c.get("id").and_then(|i| i.as_str()) {
                    id_to_course.insert(id.to_string(), c.clone());
                }
            }
        }

        let mut course_list = Vec::new();
        let mut enrolled_count = 0;

        // If courseIds are present, batch fetch photoUrl from /api/courses.v1 to guarantee high-res cover photos
        let mut course_photos: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        if let Some(cids) = element.get("courseIds").and_then(|ids| ids.as_array()) {
            let id_strs: Vec<&str> = cids.iter().filter_map(|v| v.as_str()).collect();
            if !id_strs.is_empty() {
                let batch_url = format!("{}/api/courses.v1?ids={}&fields=photoUrl,promoPhoto", COURSERA_BASE, id_strs.join(","));
                if let Ok(b_resp) = self.client.get(&batch_url).send().await {
                    if let Ok(b_data) = b_resp.json::<serde_json::Value>().await {
                        if let Some(elems) = b_data.get("elements").and_then(|e| e.as_array()) {
                            for el in elems {
                                if let Some(cid) = el.get("id").and_then(|i| i.as_str()) {
                                    if let Some(photo) = el.get("photoUrl").or_else(|| el.get("promoPhoto")).and_then(|p| p.as_str()) {
                                        course_photos.insert(cid.to_string(), photo.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(cids) = element.get("courseIds").and_then(|ids| ids.as_array()) {
            for (order_idx, cid_val) in cids.iter().enumerate() {
                let cid = cid_val.as_str().unwrap_or_default();
                if let Some(c_obj) = id_to_course.get(cid) {
                    let name = c_obj.get("name").and_then(|n| n.as_str()).unwrap_or("Course").to_string();
                    let c_slug = c_obj.get("slug").and_then(|s| s.as_str()).unwrap_or(cid).to_string();
                    let desc = c_obj.get("description").and_then(|d| d.as_str()).map(String::from);
                    let photo_url = course_photos.get(cid).cloned()
                        .or_else(|| {
                            c_obj.get("photoUrl")
                                .or_else(|| c_obj.get("promoPhoto"))
                                .and_then(|p| p.as_str())
                                .map(String::from)
                        });
                    let is_enrolled = enrolled_set.contains(cid);

                    if is_enrolled {
                        enrolled_count += 1;
                    }

                    course_list.push(SpecCourseInfo {
                        id: cid.to_string(),
                        name,
                        slug: c_slug,
                        description: desc,
                        photo_url,
                        is_enrolled,
                        order: order_idx + 1,
                    });
                }
            }
        }

        let total_courses = course_list.len();
        let all_enrolled = total_courses > 0 && enrolled_count == total_courses;

        Ok(SpecializationDetails {
            id: spec_id,
            name: spec_name,
            slug: slug.to_string(),
            description: spec_desc,
            photo_url: spec_photo,
            logo: spec_logo,
            partner_name,
            courses: course_list,
            total_courses,
            enrolled_courses: enrolled_count,
            all_enrolled,
        })
    }

    pub async fn enroll_in_course(&self, course_id: &str) -> Result<(), String> {
        let user_id_num = self.user_id.as_deref().unwrap_or("0").parse::<i64>().unwrap_or(0);
        let url = format!("{}/api/openCourseMemberships.v1", COURSERA_BASE);
        let payload = serde_json::json!({
            "courseId": course_id,
            "userId": user_id_num,
            "courseRole": "LEARNER"
        });

        let resp = self.client.post(&url).json(&payload).send().await.map_err(|e| e.to_string())?;
        if resp.status().is_success() || resp.status() == reqwest::StatusCode::CREATED {
            Ok(())
        } else {
            let err_body = resp.text().await.unwrap_or_default();
            Err(format!("Enrollment failed: {}", err_body))
        }
    }

    pub async fn enroll_in_specialization_all(&self, spec_id: &str, course_ids: &[String]) -> Result<(), String> {
        let user_id_num = self.user_id.as_deref().unwrap_or("0").parse::<i64>().unwrap_or(0);

        // 1. Enroll in specialization itself
        let spec_url = format!("{}/api/onDemandSpecializationMemberships.v1", COURSERA_BASE);
        let spec_payload = serde_json::json!({
            "s12nId": spec_id,
            "userId": user_id_num,
            "role": "LEARNER"
        });
        let _ = self.client.post(&spec_url).json(&spec_payload).send().await;

        // 2. Enroll in each course
        for cid in course_ids {
            let _ = self.enroll_in_course(cid).await;
        }

        Ok(())
    }

    pub fn client(&self) -> &Client {
        &self.client
    }
}
