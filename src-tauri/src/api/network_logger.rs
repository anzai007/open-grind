use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const NETWORK_LOGGER_WINDOW_LABEL: &str = "network-logger";

#[tauri::command]
pub async fn open_network_logger_window(app: AppHandle) -> Result<(), String> {
	if let Some(window) = app.get_webview_window(NETWORK_LOGGER_WINDOW_LABEL) {
		let _ = window.unminimize();
		let _ = window.show();
		let _ = window.set_focus();
		return Ok(());
	}

	let user_agent = format!(
		"open-grind/{} (+https://opengrind.org/; contact: admin@opengrind.org)",
		app.package_info().version
	);

	let builder = WebviewWindowBuilder::new(
		&app,
		NETWORK_LOGGER_WINDOW_LABEL,
		WebviewUrl::App("/network-logger".into()),
	)
	.title("请求与网络日志 (Network Logger)")
	.inner_size(1100.0, 750.0)
	.min_inner_size(650.0, 450.0)
	.theme(Some(tauri::Theme::Dark))
	.user_agent(&user_agent);

	#[cfg(any(target_os = "macos", target_os = "windows"))]
	let builder = builder.disable_drag_drop_handler();

	let window = builder.build().map_err(|e| e.to_string())?;

	crate::appearance::unlock_visual_effects(&window);
	crate::context_menu::trim_native_menu(&window);
	let _ = window.set_focus();

	Ok(())
}

#[tauri::command]
pub async fn close_network_logger_window(app: AppHandle) -> Result<(), String> {
	if let Some(window) = app.get_webview_window(NETWORK_LOGGER_WINDOW_LABEL) {
		let _ = window.close();
	}
	Ok(())
}
