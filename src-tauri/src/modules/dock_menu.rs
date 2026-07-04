/// macOS Dock right-click context menu.
///
/// Injects `applicationDockMenu:` into Tauri's existing NSApplicationDelegate
/// via `class_addMethod` so the system calls our handler on right-click.
#[cfg(target_os = "macos")]
pub fn setup(_app: &tauri::AppHandle) {
    use objc2::runtime::{AnyObject, Sel};
    use objc2::{msg_send, sel};
    use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
    use objc2_foundation::{MainThreadMarker, NSString};
    use std::sync::OnceLock;

    // Store the NSMenu address as usize — raw pointers are Send+Sync.
    // The menu is retained (+1) via `Retained::into_raw` and never released.
    static DOCK_MENU_PTR: OnceLock<usize> = OnceLock::new();

    // SAFETY: Tauri's setup callback is always called on the main thread.
    let mtm = unsafe { MainThreadMarker::new_unchecked() };

    let _menu_addr = *DOCK_MENU_PTR.get_or_init(|| unsafe {
        let menu = NSMenu::new(mtm);

        let add_item = |title: &str| {
            let ns_title = NSString::from_str(title);
            NSMenuItem::initWithTitle_action_keyEquivalent(
                mtm.alloc(),
                &ns_title,
                None,
                &NSString::from_str(""),
            )
        };

        menu.addItem(&add_item("New Terminal Tab"));
        menu.addItem(&add_item("New SSH Connection\u{2026}"));
        menu.addItem(&NSMenuItem::separatorItem(mtm));
        menu.addItem(&add_item("Open Host Manager"));

        // Leak the Retained<NSMenu> — it must live for the whole app lifetime.
        objc2::rc::Retained::into_raw(menu) as usize
    });

    // Inject `applicationDockMenu:` into the existing app-delegate class.
    unsafe {
        let ns_app = NSApplication::sharedApplication(mtm);
        let delegate: *mut AnyObject = msg_send![&*ns_app, delegate];
        if delegate.is_null() {
            return;
        }
        let cls: *mut std::ffi::c_void = msg_send![delegate, class];
        if cls.is_null() {
            return;
        }

        extern "C" fn dock_menu_impl(
            _self: *mut AnyObject,
            _cmd: Sel,
            _sender: *mut AnyObject,
        ) -> *const NSMenu {
            DOCK_MENU_PTR
                .get()
                .map(|addr| *addr as *const NSMenu)
                .unwrap_or(std::ptr::null())
        }

        // "@@:" — returns id, takes self + cmd + id (the NSApplication sender).
        let types = c"@:@";
        class_add_method(
            cls,
            sel!(applicationDockMenu:),
            dock_menu_impl as *const (),
            types.as_ptr(),
        );
    }
}

#[cfg(target_os = "macos")]
extern "C" {
    #[link_name = "class_addMethod"]
    fn class_add_method(
        cls: *mut std::ffi::c_void,
        name: objc2::runtime::Sel,
        imp: *const (),
        types: *const std::ffi::c_char,
    ) -> bool;
}
