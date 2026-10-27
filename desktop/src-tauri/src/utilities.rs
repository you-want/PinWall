//! Host-owned snippets and explicit text copy for the offline utility panel.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::Manager;
pub const WIDGET_ID: &str = "com.pinwall.local-tools";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snippet {
    id: String,
    title: String,
    text: String,
}
#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum Action {
    List {},
    Save {
        id: String,
        title: String,
        text: String,
    },
    Remove {
        id: String,
    },
    Clear {},
    Copy {
        text: String,
    },
}
fn validate_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-')
}
fn validate(snippet: &Snippet) -> Result<(), String> {
    if !validate_id(&snippet.id)
        || snippet.title.trim().is_empty()
        || snippet.title.len() > 256
        || snippet.text.is_empty()
        || snippet.text.len() > 64 * 1024
    {
        return Err("utility_invalid_snippet".into());
    }
    Ok(())
}
fn snippets(data: HashMap<String, Value>) -> Result<Vec<Snippet>, String> {
    if data.len() > 100 {
        return Err("utility_invalid_snippet".into());
    }
    let mut result = Vec::new();
    for (id, value) in data {
        let snippet: Snippet =
            serde_json::from_value(value).map_err(|_| "utility_invalid_snippet")?;
        validate(&snippet)?;
        if id != snippet.id {
            return Err("utility_invalid_snippet".into());
        }
        result.push(snippet);
    }
    result.sort_by(|a, b| {
        a.title
            .to_lowercase()
            .cmp(&b.title.to_lowercase())
            .then(a.id.cmp(&b.id))
    });
    Ok(result)
}
#[tauri::command]
pub async fn widget_utilities_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: Action,
) -> Result<Vec<Snippet>, String> {
    crate::metrics::require_main(window.label())?;
    crate::widgets::verify_native_tool(&app, WIDGET_ID)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Action::Copy { text } = &action {
            if text.is_empty() || text.len() > 64 * 1024 {
                return Err("utility_invalid_snippet".into());
            }
            let service = app.state::<crate::clipboard::ClipboardService>();
            let _guard = service.acquire()?;
            #[cfg(target_os = "macos")]
            crate::clipboard::write_confirmed_text(text)?;
            #[cfg(not(target_os = "macos"))]
            return Err("utility_unsupported".into());
            return Ok(Vec::new());
        }
        let path = crate::tool_files::storage_root(&app)?.join("snippets.json");
        let current = snippets(crate::widget_repository::read(&path)?)?;
        match action {
            Action::Save { id, title, text } => {
                let snippet = Snippet { id, title, text };
                validate(&snippet)?;
                if current.len() >= 100 && !current.iter().any(|s| s.id == snippet.id) {
                    return Err("utility_snippet_limit".into());
                }
                crate::widget_repository::mutate(
                    &path,
                    crate::widget_repository::Mutation::Set {
                        key: snippet.id.clone(),
                        value: serde_json::to_value(snippet)
                            .map_err(|_| "utility_invalid_snippet")?,
                    },
                )?;
            }
            Action::Remove { id } => {
                if !validate_id(&id) {
                    return Err("utility_invalid_snippet".into());
                }
                crate::widget_repository::mutate(
                    &path,
                    crate::widget_repository::Mutation::Remove { key: id },
                )?;
            }
            Action::Clear {} => crate::widget_repository::mutate(
                &path,
                crate::widget_repository::Mutation::Clear {},
            )?,
            _ => {}
        }
        snippets(crate::widget_repository::read(&path)?)
    })
    .await
    .map_err(|_| "utility_unavailable".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_malformed_and_unbounded_snippets_and_actions() {
        for snippet in [
            Snippet {
                id: "../x".into(),
                title: "Title".into(),
                text: "x".into(),
            },
            Snippet {
                id: "abc-123".into(),
                title: " ".into(),
                text: "x".into(),
            },
            Snippet {
                id: "abc-123".into(),
                title: "Title".into(),
                text: "汉".repeat(30000),
            },
        ] {
            assert!(validate(&snippet).is_err());
        }
        assert!(serde_json::from_value::<Action>(
            serde_json::json!({"method":"copy","text":"x","path":"/tmp/x"})
        )
        .is_err());
        assert!(snippets(HashMap::from([(
            "abc".into(),
            serde_json::json!({"id":"def","title":"Title","text":"x"})
        )]))
        .is_err());
        assert!(validate(&Snippet {
            id: "abc-123".into(),
            title: "标题".into(),
            text: "多行\nText".into()
        })
        .is_ok());
    }
}
