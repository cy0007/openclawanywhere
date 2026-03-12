// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_shell::process::CommandChild;

struct SidecarState(Mutex<Option<CommandChild>>);

/// 缓存隧道信息，供前端查询
pub struct TunnelState(pub Mutex<Option<String>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(SidecarState(Mutex::new(None)))
        .manage(TunnelState(Mutex::new(None)))
        .setup(|app| {
            let quit = MenuItem::with_id(app, "quit", "退出 OpenClaw", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("OpenClawAnywhere")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        if let Some(state) = app.try_state::<SidecarState>() {
                            if let Ok(mut guard) = state.0.lock() {
                                if let Some(child) = guard.take() {
                                    let _ = child.kill();
                                }
                            }
                        }
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            match sidecar::spawn_gateway(app.handle()) {
                Ok(child) => {
                    println!("[App] Sidecar 启动成功");
                    if let Some(state) = app.try_state::<SidecarState>() {
                        if let Ok(mut guard) = state.0.lock() {
                            *guard = Some(child);
                        }
                    }
                }
                Err(e) => eprintln!("[App] Sidecar 启动失败: {e}"),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_autostart,
            get_autostart_status,
            get_tunnel_info,
        ])
        .run(tauri::generate_context!())
        .expect("启动 OpenClawAnywhere 失败");
}

/// 前端查询隧道信息（解决事件时序问题）
#[tauri::command]
fn get_tunnel_info(state: tauri::State<TunnelState>) -> Option<String> {
    state.0.lock().ok().and_then(|g| g.clone())
}

#[tauri::command]
fn toggle_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if autostart.is_enabled().map_err(|e| e.to_string())? {
        autostart.disable().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        autostart.enable().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn get_autostart_status(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}
