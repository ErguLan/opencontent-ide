use serde::{Deserialize, Serialize};
use serde_json::Value;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct Operation { pub r#type: String, #[serde(flatten)] pub payload: Value }

#[derive(Debug, Serialize, Deserialize)]
pub struct AiOperation { pub action: String, #[serde(flatten)] pub payload: Value }

#[wasm_bindgen]
pub fn validate_operations(json: &str) -> Result<String, JsValue> {
    let operations: Vec<Operation> = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    if operations.len() > 200 { return Err(JsValue::from_str("TOO_MANY_OPERATIONS")); }
    const ALLOWED: &[&str] = &["set_metadata","set_content","add_element","update_element","remove_element","add_page","update_page","remove_page","reorder_pages"];
    for operation in &operations {
        if !ALLOWED.contains(&operation.r#type.as_str()) { return Err(JsValue::from_str("UNSUPPORTED_OPERATION")); }
    }
    serde_json::to_string(&operations).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn validate_ai_operations(json: &str) -> Result<String, JsValue> {
    let operations: Vec<AiOperation> = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    if operations.len() > 100 { return Err(JsValue::from_str("TOO_MANY_AI_OPERATIONS")); }
    const ALLOWED: &[&str] = &["add_node","update_node","connect_nodes","layout_diagram","add_annotation","set_document_text","add_page","remove_page","reorder_pages","set_metadata"];
    for operation in &operations {
        if !ALLOWED.contains(&operation.action.as_str()) { return Err(JsValue::from_str("UNSUPPORTED_AI_OPERATION")); }
    }
    serde_json::to_string(&operations).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn snap(value: f64, grid: f64) -> f64 { if grid <= 0.0 { value } else { (value / grid).round() * grid } }

#[wasm_bindgen]
pub fn pdf_escape_text(value: &str) -> String {
    value.chars().map(|c| match c { '\\' => "\\\\".to_string(), '(' => "\\(".to_string(), ')' => "\\)".to_string(), c if c.is_ascii_graphic() || c == ' ' => c.to_string(), _ => "?".to_string() }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn snap_rounds_to_grid() { assert_eq!(snap(27.0, 10.0), 30.0); }
    #[test] fn rejects_unknown_operation() { assert!(validate_operations(r#"[{"type":"execute_shell"}]"#).is_err()); }
    #[test] fn rejects_unknown_ai_action() { assert!(validate_ai_operations(r#"[{"action":"read_secret"}]"#).is_err()); }
}
