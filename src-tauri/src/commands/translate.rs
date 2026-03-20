use serde::{Deserialize, Serialize};

// ─── AssemblyAI temporary token ──────────────────────────

#[derive(Deserialize)]
struct AssemblyAITokenResponse {
    token: String,
}

#[tauri::command]
pub async fn get_assemblyai_token(api_key: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = "https://streaming.assemblyai.com/v3/token?expires_in_seconds=360";
    let resp = client
        .get(url)
        .header("Authorization", &api_key)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    if resp.status() == 401 {
        return Err("Invalid AssemblyAI API key".to_string());
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token request failed: HTTP {} {}", status, body));
    }

    let data: AssemblyAITokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    Ok(data.token)
}

// ─── MyMemory translation ────────────────────────────────

/// Free translation via MyMemory API (no API key needed)
/// https://mymemory.translated.net/doc/spec.php

#[derive(Deserialize)]
struct MyMemoryResponse {
    #[serde(rename = "responseData")]
    response_data: MyMemoryData,
}

#[derive(Deserialize)]
struct MyMemoryData {
    #[serde(rename = "translatedText")]
    translated_text: String,
}

#[tauri::command]
pub async fn translate_text(
    text: String,
    source_lang: String,
    target_lang: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    // MyMemory uses langpair format: "en|vi"
    // If source_lang is empty, use auto-detect (empty before |)
    let src = if source_lang.is_empty() {
        "auto".to_string()
    } else {
        source_lang
    };
    let langpair = format!("{}|{}", src, target_lang);

    let url = format!(
        "https://api.mymemory.translated.net/get?q={}&langpair={}",
        urlencoding::encode(&text),
        urlencoding::encode(&langpair)
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "PersonalTranslator/0.4")
        .send()
        .await
        .map_err(|e| format!("Translation request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Translation API returned status: {}", resp.status()));
    }

    let body: MyMemoryResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse translation response: {}", e))?;

    Ok(body.response_data.translated_text)
}

// ─── LLM-based contextual translation (OpenAI-compatible API) ───

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: u32,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Deserialize)]
struct ChatMessageResponse {
    content: String,
}

/// Context-aware translation using LLM (OpenAI-compatible API)
#[tauri::command]
pub async fn translate_text_llm(
    text: String,
    source_lang: String,
    target_lang: String,
    context_sentences: Vec<String>,
    domain: String,
    custom_terms: Vec<Vec<String>>,
    api_key: String,
    base_url: String,
    model: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    let src_label = lang_label(&source_lang);
    let tgt_label = lang_label(&target_lang);

    // Build system prompt
    let mut system = format!(
        "You are a professional real-time interpreter. Your task is to translate from {} to {}.
            You MUST always output the text in {} format — no exceptions.
            The output must be natural, as similar to human communication as possible.
            Only output the translated text in {} format — no explanations, no quotation marks, no additional formatting.",
        src_label, tgt_label, tgt_label, tgt_label
    );

    if !domain.is_empty() {
        system.push_str(&format!(
            "\nDomain/context: {}. Use terminology and style appropriate for this domain.",
            domain
        ));
    }

    if !custom_terms.is_empty() {
        system.push_str("\nUse these specific term translations:");
        for pair in &custom_terms {
            if pair.len() == 2 {
                system.push_str(&format!("\n  \"{}\" → \"{}\"", pair[0], pair[1]));
            }
        }
    }

    // Build user message with recent context
    let mut user_msg = String::new();
    if !context_sentences.is_empty() {
        user_msg.push_str("Recent conversation for context:\n");
        for s in &context_sentences {
            user_msg.push_str(&format!("- {}\n", s));
        }
        user_msg.push('\n');
    }
    user_msg.push_str(&format!("Translate the following text into {}:\n{}", tgt_label, text));

    // Auto-detect correct base URL from API key prefix
    let effective_base_url = if api_key.starts_with("gsk_") && base_url.contains("api.openai.com") {
        "https://api.groq.com/openai/v1".to_string()
    } else if api_key.starts_with("AIza") && base_url.contains("api.openai.com") {
        "https://generativelanguage.googleapis.com/v1beta/openai".to_string()
    } else {
        base_url
    };

    let endpoint = format!(
        "{}/chat/completions",
        effective_base_url.trim_end_matches('/')
    );

    let body = ChatRequest {
        model,
        messages: vec![
            ChatMessage { role: "system".to_string(), content: system },
            ChatMessage { role: "user".to_string(), content: user_msg },
        ],
        temperature: 0.3,
        max_tokens: 1024,
        stream: false,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("LLM API error {}: {}", status, err_body));
    }

    let chat_resp: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    let translated = chat_resp
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .unwrap_or_default();

    if translated.is_empty() {
        return Err("LLM returned empty translation".to_string());
    }

    Ok(translated)
}

fn lang_label(code: &str) -> &str {
    match code {
        "en" => "English",
        "vi" => "Vietnamese",
        "ja" => "Japanese",
        "ko" => "Korean",
        "zh" => "Chinese",
        "fr" => "French",
        "de" => "German",
        "es" => "Spanish",
        "th" => "Thai",
        "id" => "Indonesian",
        "auto" | "" => "the detected language",
        other => other,
    }
}
