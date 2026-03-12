//! Sidecar 管理模块
//! 负责启动和监控 Node.js 网关进程（通过 pkg 打包的单文件二进制）。

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// 启动网关 Sidecar 进程，返回 child 句柄用于退出时清理。
pub fn spawn_gateway(app: &AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let sidecar = app.shell().sidecar("openclaw-gateway")?;
    let (mut rx, child) = sidecar.spawn()?;
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    let trimmed = text.trim();

                    // 尝试从行中提取 JSON 事件
                    if let Some(json_start) = trimmed.find('{') {
                        let json_str = &trimmed[json_start..];
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                            if let Some(evt) = val.get("event").and_then(|e| e.as_str()) {
                                println!("[Sidecar] 收到事件: {}", evt);
                                if evt == "tunnel_ready" {
                                    // 缓存到 TunnelState，供前端轮询
                                    if let Some(state) = app_handle.try_state::<crate::TunnelState>() {
                                        if let Ok(mut guard) = state.0.lock() {
                                            *guard = Some(json_str.to_string());
                                        }
                                    }
                                    let _ = app_handle.emit("tunnel_ready", json_str.to_string());
                                    println!("[Sidecar] 已转发 tunnel_ready 到 WebView (已缓存)");
                                }
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
    Ok(child)
}
