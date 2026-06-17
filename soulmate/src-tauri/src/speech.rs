use objc::{class, msg_send, sel, sel_impl};
use objc::runtime::Object;
use std::io::Write;
use std::sync::mpsc;

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

fn transcribe_file(path: &std::path::Path, locale: &str) -> Result<String, String> {
    unsafe {
        let path_str = std::ffi::CString::new(path.to_string_lossy().as_bytes())
            .map_err(|e| e.to_string())?;
        let ns_string: *mut Object = msg_send![class!(NSString), stringWithUTF8String: path_str.as_ptr()];
        let url: *mut Object = msg_send![class!(NSURL), fileURLWithPath: ns_string];

        let locale_cstr = std::ffi::CString::new(locale).map_err(|e| e.to_string())?;
        let ns_locale: *mut Object = msg_send![class!(NSLocale), localeWithLocaleIdentifier: locale_cstr.as_ptr()];

        let recognizer: *mut Object = msg_send![class!(SFSpeechRecognizer), alloc];
        let recognizer: *mut Object = msg_send![recognizer, initWithLocale: ns_locale];
        if recognizer.is_null() {
            return Err("Speech recognizer not available for this locale. Check System Settings > Privacy > Speech Recognition.".into());
        }

        let request: *mut Object = msg_send![class!(SFSpeechURLRecognitionRequest), alloc];
        let request: *mut Object = msg_send![request, initWithURL: url];
        if request.is_null() {
            return Err("Failed to create recognition request".into());
        }

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

        let _task: *mut Object = msg_send![recognizer, recognitionTaskWithRequest: request resultHandler: &*block];

        rx.recv_timeout(std::time::Duration::from_secs(30))
            .map_err(|e| format!("Speech recognition timed out: {}", e))
    }
}
