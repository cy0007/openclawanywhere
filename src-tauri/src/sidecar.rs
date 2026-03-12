//! Sidecar 管理模块
//! 负责启动和监控 Node.js 网关进程（通过 pkg 打包的单文件二进制）。

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

/// 启动网关 Sidecar 进程。
/// Tauri 会自动在 `binaries/` 目录下查找与当前平台匹配的二进制文件。
pub fn spawn_gateway(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let sidecar = app.shell().sidecar("binaries/openclaw-gateway")?;

    let (mut _rx, _child) = sidecar.spawn()?;

    // 在后台线程中监听 Sidecar 输出
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        while let Some(event) = _rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
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
