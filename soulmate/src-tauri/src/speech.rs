// TODO: 大版本更新时迁移 objc 0.2 + block 0.1 → objc2 + block2
// 当前 block v0.1.6 有 future-incompat 警告，未来 Rust 版本可能拒绝编译
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};
#[cfg(target_os = "macos")]
use objc::runtime::Object;
#[cfg(target_os = "macos")]
use std::io::Write;
#[cfg(target_os = "macos")]
use std::sync::mpsc;

#[cfg(target_os = "macos")]
pub fn recognize_speech(audio_data: Vec<u8>, locale: &str) -> Result<String, String> {
    let mut tmp = std::env::temp_dir();
    tmp.push(format!("soulmate_stt_{}.mp4", std::process::id()));
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(&audio_data).map_err(|e| e.to_string())?;
    }

    let result = transcribe_file(&tmp, locale);
    std::fs::remove_file(&tmp).ok();
    result
}

#[cfg(not(target_os = "macos"))]
pub fn recognize_speech(_audio_data: Vec<u8>, _locale: &str) -> Result<String, String> {
    Err("语音识别仅在 macOS 上可用".into())
}

#[cfg(target_os = "macos")]
fn transcribe_file(path: &std::path::Path, locale: &str) -> Result<String, String> {
    unsafe {
        let pool: *mut Object = msg_send![class!(NSAutoreleasePool), new];

        let path_str = std::ffi::CString::new(path.to_string_lossy().as_bytes())
            .map_err(|e| e.to_string())?;
        let ns_string: *mut Object = msg_send![class!(NSString), stringWithUTF8String: path_str.as_ptr()];
        let url: *mut Object = msg_send![class!(NSURL), fileURLWithPath: ns_string];

        let locale_cstr = std::ffi::CString::new(locale).map_err(|e| e.to_string())?;
        let ns_locale: *mut Object = msg_send![class!(NSLocale), localeWithLocaleIdentifier: locale_cstr.as_ptr()];

        let recognizer: *mut Object = msg_send![class!(SFSpeechRecognizer), alloc];
        let recognizer: *mut Object = msg_send![recognizer, initWithLocale: ns_locale];
        if recognizer.is_null() {
            let _: () = msg_send![pool, drain];
            return Err("Speech recognizer not available for this locale. Check System Settings > Privacy > Speech Recognition.".into());
        }
        let _: () = msg_send![recognizer, retain];

        let request: *mut Object = msg_send![class!(SFSpeechURLRecognitionRequest), alloc];
        let request: *mut Object = msg_send![request, initWithURL: url];
        if request.is_null() {
            let _: () = msg_send![recognizer, release];
            let _: () = msg_send![pool, drain];
            return Err("Failed to create recognition request".into());
        }
        let _: () = msg_send![request, retain];

        let _: () = msg_send![request, setRequiresOnDeviceRecognition: false];
        let _: () = msg_send![request, setShouldReportPartialResults: false];

        let (tx, rx) = mpsc::channel();

        let block = block::ConcreteBlock::new(move |result: *mut Object, _error: *mut Object| {
            let text = if result.is_null() {
                String::new()
            } else {
                let transcription: *mut Object = msg_send![result, bestTranscription];
                let formatted: *mut Object = msg_send![transcription, formattedString];
                let c_str: *const i8 = msg_send![formatted, UTF8String];
                std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned()
            };
            tx.send(text).ok();
        });
        let block = block.copy();

        let task: *mut Object = msg_send![recognizer, recognitionTaskWithRequest: request resultHandler: &*block];

        let result = rx.recv_timeout(std::time::Duration::from_secs(30))
            .map_err(|e| format!("Speech recognition timed out: {}", e));

        if !task.is_null() {
            let _: () = msg_send![task, cancel];
            let _: () = msg_send![task, release];
        }
        let _: () = msg_send![request, release];
        let _: () = msg_send![recognizer, release];
        let _: () = msg_send![pool, drain];

        result
    }
}
