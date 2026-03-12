//! Sidecar 管理模块
//! 负责启动和监控 Node.js 网关进程（通过 pkg 打包的单文件二进制）。

use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

/// 启动网关 Sidecar 进程。
pub fn spawn_gateway(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let sidecar = app.shell().sidecar("openclaw-gateway")?;
    let (mut _rx, _child) = sidecar.spawn()?;
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        while let Some(event) = _rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    let trimmed = text.trim();

                    // 解析结构化事件并转发到 WebView
                    if trimmed.starts_with('{') && trimmed.contains("\"event\"") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                            if val.get("event").and_then(|e| e.as_str()) == Some("tunnel_ready") {
                                let _ = app_handle.emit("tunnel_ready", trimmed.to_string());
                            }
                        }
                    }

                    println!("[Gateway] {}", text);
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("[Gateway:err] {}", text);
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!(
                        "[Gateway] 进程已退出, code={:?}, signal={:?}",
                        payload.code, payload.signal
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    println!("[Sidecar] 网关进程已启动");
    Ok(())
}
