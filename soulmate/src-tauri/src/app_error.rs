use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    code: &'static str,
    user_message: String,
    retryable: bool,
}

impl AppError {
    pub fn classify(message: String) -> Self {
        let normalized = message.to_ascii_lowercase();
        if normalized.contains("401")
            || normalized.contains("403")
            || normalized.contains("unauthorized")
            || normalized.contains("forbidden")
        {
            return Self::new(
                "model.authenticationFailed",
                "身份验证失败，请检查 API Key 是否正确或已过期",
                false,
            );
        }
        if normalized.contains("429") || normalized.contains("rate limit") {
            return Self::new(
                "model.rateLimited",
                "请求有点频繁，模型服务正在限流，请稍后再试",
                true,
            );
        }
        if normalized.contains("402") || normalized.contains("insufficient balance") {
            return Self::new(
                "model.insufficientBalance",
                "模型服务账户余额或额度不足，请检查服务商控制台",
                false,
            );
        }
        if normalized.contains("404") || normalized.contains("model not found") {
            return Self::new(
                "model.notFound",
                "模型名称或 API 地址不存在，请在设置中选择当前可用的模型",
                false,
            );
        }
        if normalized.contains("400") || normalized.contains("invalid model") {
            return Self::new(
                "model.invalidRequest",
                "模型名称或请求参数不被服务商接受，请检查模型设置",
                false,
            );
        }
        if normalized.contains("timeout") || normalized.contains("timed out") {
            return Self::new("model.timeout", "模型响应超时，请检查网络或稍后再试", true);
        }
        if message.contains("回复在完成前中断") {
            return Self::new(
                "model.incompleteResponse",
                "模型回复在完成前中断，请重试",
                true,
            );
        }
        if normalized.contains("端点")
            || normalized.contains("endpoint")
            || normalized.contains("api key")
            || normalized.contains("大小限制")
        {
            return Self::new("model.invalidConfiguration", message, false);
        }
        if normalized.contains("keyring") || normalized.contains("钥匙串") {
            return Self::new(
                "credential.unavailable",
                "无法访问系统钥匙串，请稍后重试或检查系统权限",
                false,
            );
        }
        if normalized.contains("本地模型")
            || normalized.contains("ollama")
            || normalized.contains("lm studio")
        {
            return Self::new("model.localUnavailable", message, true);
        }
        Self::new(
            "model.unavailable",
            "模型服务暂时不可用，请检查网络和模型设置后再试",
            true,
        )
    }

    fn new(code: &'static str, user_message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code,
            user_message: user_message.into(),
            retryable,
        }
    }
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        Self::classify(message)
    }
}

impl From<&'static str> for AppError {
    fn from(message: &'static str) -> Self {
        Self::classify(message.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn classifies_errors_into_stable_frontend_contracts() {
        let authentication = AppError::classify("API request failed: 401".into());
        assert_eq!(authentication.code, "model.authenticationFailed");
        assert!(!authentication.retryable);

        let rate_limited = AppError::classify("429 Too Many Requests".into());
        assert_eq!(rate_limited.code, "model.rateLimited");
        assert!(rate_limited.retryable);

        let missing_model = AppError::classify("API request failed: 404 Not Found".into());
        assert_eq!(missing_model.code, "model.notFound");
        assert!(!missing_model.retryable);

        let balance = AppError::classify("API request failed: 402 Payment Required".into());
        assert_eq!(balance.code, "model.insufficientBalance");

        let incomplete = AppError::classify("模型回复在完成前中断，请重试".into());
        assert_eq!(incomplete.code, "model.incompleteResponse");
        assert!(incomplete.retryable);
    }
}
