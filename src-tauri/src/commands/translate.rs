use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechToTextModelOption {
    value: String,
    label: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct DeepgramModelsResponse {
    stt: Vec<DeepgramModel>,
}

#[derive(Debug, Deserialize, Clone)]
struct DeepgramModel {
    canonical_name: String,
    architecture: String,
    version: String,
    streaming: bool,
}

#[tauri::command]
pub async fn get_stt_models(provider: String) -> Result<Vec<SpeechToTextModelOption>, String> {
    match provider.as_str() {
        "deepgram" => fetch_deepgram_models().await,
        "assemblyai" => fetch_assemblyai_models().await,
        other => Err(format!("Unsupported speech-to-text provider: {}", other)),
    }
}

async fn fetch_deepgram_models() -> Result<Vec<SpeechToTextModelOption>, String> {
    let response: DeepgramModelsResponse = reqwest::Client::new()
        .get("https://api.deepgram.com/v1/models")
        .send()
        .await
        .map_err(|e| format!("Deepgram model request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse Deepgram models: {}", e))?;

    let mut latest_models: HashMap<String, DeepgramModel> = HashMap::new();

    for model in response.stt.into_iter().filter(|model| {
        model.streaming
            && matches!(
                model.architecture.as_str(),
                "flux" | "nova-3" | "nova-2" | "whisper"
            )
            && !model.canonical_name.contains("dQw4w9WgXcQ")
    }) {
        let key = model.canonical_name.clone();
        match latest_models.get(&key) {
            Some(current) if current.version >= model.version => {}
            _ => {
                latest_models.insert(key, model);
            }
        }
    }

    let mut options: Vec<SpeechToTextModelOption> = latest_models
        .into_values()
        .map(|model| SpeechToTextModelOption {
            label: deepgram_label(&model.canonical_name),
            description: deepgram_description(&model.canonical_name),
            value: model.canonical_name,
        })
        .collect();

    options.sort_by(|left, right| {
        deepgram_sort_key(&left.value)
            .cmp(&deepgram_sort_key(&right.value))
            .then_with(|| left.label.cmp(&right.label))
    });

    if options.is_empty() {
        return Err("Deepgram returned no compatible streaming models".to_string());
    }

    Ok(options)
}

async fn fetch_assemblyai_models() -> Result<Vec<SpeechToTextModelOption>, String> {
    let client = reqwest::Client::new();
    let universal_html = client
        .get("https://www.assemblyai.com/docs/api-reference/streaming-api/universal-streaming")
        .send()
        .await
        .map_err(|e| format!("AssemblyAI model request failed: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read AssemblyAI model response: {}", e))?;

    let u3_html = client
        .get("https://www.assemblyai.com/docs/api-reference/streaming-api/universal-3-pro-streaming/universal-3-pro-streaming")
        .send()
        .await
        .map_err(|e| format!("AssemblyAI U3 model request failed: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read AssemblyAI U3 response: {}", e))?;

    let mut values = HashSet::new();
    values.extend(extract_schema_enum_values(
        &universal_html,
        r#"speech_model":{"name":"streaming_speech_model""#,
    ));
    values.extend(extract_schema_enum_values(
        &u3_html,
        r#"speech_model":{"name":"streamingU3Pro_speech_model""#,
    ));

    let mut options: Vec<SpeechToTextModelOption> = values
        .into_iter()
        .map(|value| SpeechToTextModelOption {
            label: assemblyai_label(&value),
            description: assemblyai_description(&value),
            value,
        })
        .collect();

    options.sort_by(|left, right| {
        assemblyai_sort_key(&left.value)
            .cmp(&assemblyai_sort_key(&right.value))
            .then_with(|| left.label.cmp(&right.label))
    });

    if options.is_empty() {
        return Err("AssemblyAI returned no streaming models".to_string());
    }

    Ok(options)
}

fn extract_schema_enum_values(html: &str, marker: &str) -> Vec<String> {
    let Some(start) = html.find(marker) else {
        return Vec::new();
    };

    let slice = &html[start..html.len().min(start + 2000)];
    let token = r#""value":"#;
    let mut values = Vec::new();
    let mut cursor = slice;

    while let Some(index) = cursor.find(token) {
        let value_start = index + token.len();
        let remainder = &cursor[value_start..];
        let Some(end) = remainder.find('"') else {
            break;
        };
        values.push(remainder[..end].to_string());
        cursor = &remainder[end + 1..];
    }

    values
}

fn deepgram_sort_key(value: &str) -> (u8, &str) {
    let rank = match value {
        "nova-3-general" => 0,
        "nova-3-medical" => 1,
        "nova-2-general" => 2,
        "nova-2-medical" => 3,
        _ if value.starts_with("nova-3") => 4,
        _ if value.starts_with("nova-2") => 5,
        _ if value.starts_with("flux") => 6,
        _ if value.starts_with("whisper") => 7,
        _ => 8,
    };

    (rank, value)
}

fn assemblyai_sort_key(value: &str) -> (u8, &str) {
    let rank = match value {
        "u3-rt-pro" => 0,
        "universal-streaming-multilingual" => 1,
        "universal-streaming-english" => 2,
        "whisper-rt" => 3,
        _ => 4,
    };

    (rank, value)
}

fn deepgram_label(value: &str) -> String {
    match value {
        "nova-3-general" => "Nova-3 General".to_string(),
        "nova-3-medical" => "Nova-3 Medical".to_string(),
        "nova-2-general" => "Nova-2 General".to_string(),
        "nova-2-medical" => "Nova-2 Medical".to_string(),
        _ => titleize_model_name(value),
    }
}

fn assemblyai_label(value: &str) -> String {
    match value {
        "u3-rt-pro" => "Universal-3 Pro".to_string(),
        "universal-streaming-multilingual" => "Universal Streaming Multilingual".to_string(),
        "universal-streaming-english" => "Universal Streaming English".to_string(),
        "whisper-rt" => "Whisper RT".to_string(),
        _ => titleize_model_name(value),
    }
}

fn deepgram_description(value: &str) -> Option<String> {
    match value {
        "nova-3-general" => Some("Latest general-purpose streaming model".to_string()),
        "nova-3-medical" => Some("Medical terminology and dictation".to_string()),
        _ if value.starts_with("nova-2") => Some("Previous-generation streaming model".to_string()),
        _ if value.starts_with("whisper") => {
            Some("Open-source Whisper served by Deepgram".to_string())
        }
        _ => None,
    }
}

fn assemblyai_description(value: &str) -> Option<String> {
    match value {
        "u3-rt-pro" => Some("Newest high-accuracy streaming model".to_string()),
        "universal-streaming-multilingual" => {
            Some("Best for supported multilingual real-time transcription".to_string())
        }
        "universal-streaming-english" => Some("English-optimized streaming model".to_string()),
        "whisper-rt" => Some("Broadest language coverage".to_string()),
        _ => None,
    }
}

fn titleize_model_name(value: &str) -> String {
    value
        .split('-')
        .map(|part| match part {
            "rt" => "RT".to_string(),
            "atc" => "ATC".to_string(),
            "ea" => "EA".to_string(),
            other if other.chars().all(|ch| ch.is_ascii_digit()) => other.to_string(),
            other => {
                let mut chars = other.chars();
                match chars.next() {
                    Some(first) => {
                        first.to_ascii_uppercase().to_string()
                            + &chars.as_str().to_ascii_lowercase()
                    }
                    None => String::new(),
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
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
    let mut retries = 3;
    let mut last_error = String::new();

    while retries > 0 {
        match client
            .get(&url)
            .header("User-Agent", "PersonalTranslator/0.4")
            .send()
            .await
        {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_error = format!("Translation API returned status: {}", resp.status());
                    retries -= 1;
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    continue;
                }

                match resp.json::<MyMemoryResponse>().await {
                    Ok(body) => return Ok(body.response_data.translated_text),
                    Err(e) => {
                        last_error = format!("Failed to parse translation response: {}", e);
                        retries -= 1;
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }
            Err(e) => {
                last_error = format!("Translation request failed: {}", e);
                retries -= 1;
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    }

    Err(last_error)
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
#[allow(clippy::too_many_arguments)]
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
    formality: Option<String>,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    let src_label = lang_label(&source_lang);
    let tgt_label = lang_label(&target_lang);
    let formality_level = formality.unwrap_or_else(|| "auto".to_string());

    // Build enhanced system prompt with better instructions
    let mut system = format!(
        r#"You are an expert real-time interpreter specializing in {src} to {tgt} translation.

## Core Rules
1. Output ONLY the translated text in {tgt} — no explanations, no quotation marks, no prefixes
2. Preserve the original meaning, tone, and intent
3. Use natural, fluent {tgt} that sounds like native speech
4. Maintain consistency with previous translations in the conversation

## Translation Style"#,
        src = src_label,
        tgt = tgt_label
    );

    // Add formality instructions
    match formality_level.as_str() {
        "formal" => {
            system.push_str(
                "\n- Use formal/polite language appropriate for professional or official contexts",
            );
        }
        "casual" => {
            system
                .push_str("\n- Use casual/informal language appropriate for friendly conversation");
        }
        _ => {
            system.push_str("\n- Match the formality level of the source text automatically");
        }
    }

    // Add domain context
    if !domain.is_empty() {
        system.push_str(&format!(
            "\n\n## Domain Context\nThis conversation is about: {}. Use appropriate terminology and style for this domain.",
            domain
        ));
    }

    // Add custom terminology with clear instructions
    if !custom_terms.is_empty() {
        system.push_str("\n\n## Required Terminology\nALWAYS use these exact translations when the source terms appear:");
        for pair in &custom_terms {
            if pair.len() == 2 && !pair[0].is_empty() && !pair[1].is_empty() {
                system.push_str(&format!("\n• \"{}\" → \"{}\"", pair[0], pair[1]));
            }
        }
    }

    // Build user message with enhanced context format
    let mut user_msg = String::new();

    if !context_sentences.is_empty() {
        user_msg.push_str("## Recent Conversation Context\n");
        user_msg.push_str("(Use this to understand the flow and maintain consistency)\n");
        for (i, s) in context_sentences.iter().enumerate() {
            user_msg.push_str(&format!("{}. {}\n", i + 1, s));
        }
        user_msg.push('\n');
    }

    user_msg.push_str(&format!(
        "## Text to Translate\n{}\n\n## Your Translation",
        text
    ));

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
            ChatMessage {
                role: "system".to_string(),
                content: system,
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_msg,
            },
        ],
        temperature: 0.2, // Lower temperature for more consistent translations
        max_tokens: 1024,
        stream: false,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut retries = 3;
    let mut last_error = String::new();
    let mut translated = String::new();

    while retries > 0 {
        match client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            Ok(resp) => {
                if !resp.status().is_success() {
                    let status = resp.status();
                    let err_body = resp.text().await.unwrap_or_default();
                    last_error = format!("LLM API error {}: {}", status, err_body);
                    retries -= 1;
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    continue;
                }

                match resp.json::<ChatResponse>().await {
                    Ok(chat_resp) => {
                        let mut content = chat_resp
                            .choices
                            .first()
                            .map(|c| c.message.content.trim().to_string())
                            .unwrap_or_default();

                        if content.starts_with('"') && content.ends_with('"') && content.len() >= 2
                        {
                            content = content[1..content.len() - 1].to_string();
                        }

                        translated = content.trim().to_string();
                        break;
                    }
                    Err(e) => {
                        last_error = format!("Failed to parse LLM response: {}", e);
                        retries -= 1;
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }
            Err(e) => {
                last_error = format!("LLM request failed: {}", e);
                retries -= 1;
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    }

    if translated.is_empty() && !last_error.is_empty() {
        return Err(last_error);
    }

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
