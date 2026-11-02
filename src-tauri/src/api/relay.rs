use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use wreq::{Client, Method};

use crate::error::AppError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayHttpRequest {
	pub method: String,
	pub url: String,
	#[serde(default)]
	pub headers: HashMap<String, String>,
	pub body: Option<String>,
	pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayHttpResponse {
	pub status: u16,
	pub body: String,
	pub headers: HashMap<String, String>,
}

#[tauri::command]
pub async fn relay_http_request(
	req: RelayHttpRequest,
) -> Result<RelayHttpResponse, AppError> {
	let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(30_000));
	let client = Client::builder()
		.min_tls_version(wreq::tls::TlsVersion::TLS_1_2)
		.connect_timeout(Duration::from_secs(15))
		.read_timeout(timeout)
		.build()
		.map_err(|e| AppError::Http(e.to_string()))?;

	let method = Method::from_str(&req.method)
		.map_err(|e| AppError::Http(format!("Invalid HTTP method: {e}")))?;

	let mut builder = client.request(method, &req.url);
	for (key, value) in req.headers {
		builder = builder.header(key, value);
	}
	if let Some(body) = req.body {
		builder = builder.body(body);
	}

	let response = builder
		.send()
		.await
		.map_err(|e| AppError::Http(e.to_string()))?;

	let status = response.status().as_u16();
	let mut headers = HashMap::new();
	for (name, val) in response.headers() {
		if let Ok(val_str) = val.to_str() {
			headers.insert(name.as_str().to_string(), val_str.to_string());
		}
	}

	let body = response
		.text()
		.await
		.map_err(|e| AppError::Http(e.to_string()))?;

	Ok(RelayHttpResponse {
		status,
		body,
		headers,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_request_payload_deserialization() {
		let json = r#"{
			"method": "POST",
			"url": "https://omni-relay.toonhub.top/v1/nearby",
			"headers": {
				"omni-platform": "scruff",
				"omni-key": "test"
			},
			"body": "{\"lat\": 1.0}",
			"timeoutMs": 5000
		}"#;
		let req: RelayHttpRequest = serde_json::from_str(json).unwrap();
		assert_eq!(req.method, "POST");
		assert_eq!(req.url, "https://omni-relay.toonhub.top/v1/nearby");
		assert_eq!(req.headers.get("omni-platform").unwrap(), "scruff");
		assert_eq!(req.body, Some("{\"lat\": 1.0}".to_string()));
		assert_eq!(req.timeout_ms, Some(5000));
	}

	#[tokio::test]
	async fn test_real_ping() {
		let mut headers = HashMap::new();
		headers.insert(
			"omni-key".to_string(),
			"omni__nNniWrIV4NTnu1lxBCE_DuwQpj6qqBIAPwWzoWwx8A".to_string(),
		);
		headers.insert("omni-platform".to_string(), "scruff".to_string());
		let req = RelayHttpRequest {
			method: "GET".to_string(),
			url: "https://omni-relay.toonhub.top/_private/im/conversations?platform=scruff&user=ping_check".to_string(),
			headers,
			body: None,
			timeout_ms: Some(10000),
		};
		let res = relay_http_request(req).await;
		println!("real ping result: {:?}", res);
		assert!(res.is_ok());
	}
}
