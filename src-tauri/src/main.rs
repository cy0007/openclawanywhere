// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // ── 系统托盘 ──
            let quit = MenuItem::with_id(app, "quit", "退出 OpenClaw", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("OpenClawAnywhere")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
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

            // ── 启动 Sidecar (Node.js 网关) ──
            sidecar::spawn_gateway(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_autostart,
            get_autostart_status,
        ])
        .run(tauri::generate_context!())
        .expect("启动 OpenClawAnywhere 失败");
}

/// 切换开机自启状态
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

/// 获取当前开机自启状态
#[tauri::command]
fn get_autostart_status(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}
