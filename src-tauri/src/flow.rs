use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

mod location;

// ID derivado de la clave PÚBLICA SPKI del paquete vimo-automate 0.2.8.
// Nunca se confía en un origen porque se anuncie. No es una credencial.
const TRUSTED_EXTENSION_ORIGINS: &[&str] = &["chrome-extension://bjpjjnjiikhccbjlkgmfpfhenbdpikbm"];
const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const STARTUP_POLL_INTERVAL: Duration = Duration::from_millis(50);
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const FLOW_TOOLS_TOOL_ID: &str = "e42285e2-1038-4e24-adc1-ed30c690ab29";

#[derive(Default)]
pub struct FlowService {
    running: Mutex<Option<FlowProcess>>,
    stopping: AtomicBool,
}

impl FlowService {
    fn is_stopping(&self) -> bool {
        self.stopping.load(Ordering::Acquire)
    }

    fn stop(&self) {
        // Se cierra la puerta ANTES de esperar al arranque. Una tarea encolada
        // o esperando handshake no puede publicar otro hijo después de Exit.
        self.stopping.store(true, Ordering::Release);
        let mut running = self
            .running
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        running.take();
    }
}

struct FlowProcess {
    child: Child,
    runtime: Value,
}

impl Drop for FlowProcess {
    fn drop(&mut self) {
        if let Some(mut input) = self.child.stdin.take() {
            let _ = input.write_all(b"{\"type\":\"shutdown\"}\n");
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start_service(app: &AppHandle) -> Result<Value, String> {
    let state = app.state::<FlowService>();
    if state.is_stopping() {
        return Err("flow_unavailable".into());
    }
    let mut running = state.running.lock().map_err(|_| "flow_unavailable")?;
    if state.is_stopping() {
        return Err("flow_unavailable".into());
    }
    if let Some(process) = running.as_mut() {
        if matches!(process.child.try_wait(), Ok(None)) {
            return Ok(process.runtime.clone());
        }
    }
    running.take();

    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "flow_unavailable")?;
    let location = location::resolve_location(&app_data_dir)?;
    let directory = location.data_dir;
    let executable = std::env::current_exe()
        .map_err(|_| "flow_unavailable")?
        .with_file_name(format!("vimo-pipeline{}", std::env::consts::EXE_SUFFIX));
    let mut command = Command::new(executable);
    command
        .arg("flow-service")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let child = command.spawn().map_err(|_| "flow_unavailable")?;
    let mut process = FlowProcess {
        child,
        runtime: Value::Null,
    };
    let mut init = json!({ "dataDir": directory, "trustedExtensionOrigins": TRUSTED_EXTENSION_ORIGINS });
    if let Some(port) = location.bridge_port {
        init["bridgePort"] = json!(port);
    }
    // Import existing automatic intents after reopening, without API keys or
    // a generation job. Both paths are native configuration, never webview input.
    let binary_paths = crate::pipeline::binaries::resolve_binary_paths();
    if let (Some(projects_root), Some(ffmpeg)) = (
        crate::settings::projects_root::resolve_projects_root(app),
        binary_paths.get("ffmpeg").and_then(Value::as_str),
    ) {
        init["projectsRoot"] = json!(projects_root);
        init["ffmpegPath"] = json!(ffmpeg);
    }
    let input = process.child.stdin.as_mut().ok_or("flow_unavailable")?;
    writeln!(input, "{init}").map_err(|_| "flow_unavailable")?;
    let stdout = process.child.stdout.take().ok_or("flow_unavailable")?;
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout).take(8192);
        let mut line = String::new();
        let result = reader.read_line(&mut line).map(|_| line);
        let _ = sender.send(result);
    });
    let line = wait_for_ready(&receiver, &state)?;
    let ready: Value = serde_json::from_str(&line).map_err(|_| "flow_unavailable")?;
    if ready.get("type").and_then(Value::as_str) != Some("flow-service-ready") {
        return Err(safe_error(ready.get("code").and_then(Value::as_str)));
    }
    let port = ready
        .get("port")
        .and_then(Value::as_u64)
        .filter(|port| *port > 1023 && *port <= 65535)
        .ok_or("flow_unavailable")?;
    let token = ready
        .get("token")
        .and_then(Value::as_str)
        .filter(|token| {
            token.len() >= 43
                && token.len() <= 128
                && token
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        })
        .ok_or("flow_unavailable")?;
    process.runtime = json!({ "port": port, "token": token, "dataDir": directory });
    let runtime = process.runtime.clone();
    if state.is_stopping() {
        return Err("flow_unavailable".into());
    }
    *running = Some(process);
    Ok(runtime)
}

fn wait_for_ready(
    receiver: &mpsc::Receiver<std::io::Result<String>>,
    state: &FlowService,
) -> Result<String, String> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        if state.is_stopping() {
            return Err("flow_unavailable".into());
        }
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            return Err("flow_unavailable".into());
        };
        match receiver.recv_timeout(remaining.min(STARTUP_POLL_INTERVAL)) {
            Ok(result) => return result.map_err(|_| "flow_unavailable".into()),
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => return Err("flow_unavailable".into()),
        }
    }
}

// El listener nace al abrir Vimo, aunque el webview todavía no visite Flow.
// Usa exactamente el mismo mutex, puerto y directorio que los comandos.
#[cfg(desktop)]
pub fn start_on_launch(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if ensure_runtime(&app).await.is_err() && !app.state::<FlowService>().is_stopping() {
            // Mensaje fijo: nunca loguear el runtime, token, URL ni stderr.
            log::warn!("Flow listener unavailable at startup; the next Flow command can retry");
        }
    });
}

pub async fn ensure_runtime(app: &AppHandle) -> Result<Value, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || start_service(&app))
        .await
        .map_err(|_| "flow_unavailable".to_string())?
}

// Sólo códigos conocidos cruzan al webview. Nunca reenviar errores de
// reqwest: pueden incluir la URL privada, cabeceras o contenido del request.
fn safe_error(code: Option<&str>) -> String {
    match code {
        Some("EADDRINUSE") | Some("flow_port_in_use") => "flow_port_in_use",
        Some("store_in_use") => "flow_store_in_use",
        Some("discovery_origin_untrusted") => "flow_origin_untrusted",
        Some("discovery_expired") => "flow_discovery_expired",
        Some("discovery_not_ready") => "flow_not_connected",
        Some("capacity_required") => "flow_capacity_required",
        Some("flow_command_invalid") => "flow_command_invalid",
        Some(
            code @ ("flow_tools_coordinator_upgrade_required"
            | "execution_plan_invalid"
            | "seed_invalid"
            | "flow_tools_model_or_aspect_invalid"
            | "execution_plan_unavailable"
            | "retry_execution_plan_unavailable"
            | "batch_execution_plan_mixed"
            | "execution_plan_mismatch"
            | "batch_execution_plan_conflict"
            | "batch_id_conflict"
            | "job_hash_mismatch"
            | "store_execution_plan_invalid"),
        ) => code,
        _ => "flow_unavailable",
    }
    .to_owned()
}

fn valid_flow_tools_plan(value: &Value) -> bool {
    let Some(plan) = value.as_object() else {
        return false;
    };
    plan.len() == 4
        && plan.get("version").and_then(Value::as_f64) == Some(1.0)
        && plan.get("kind").and_then(Value::as_str) == Some("flow-tools")
        && plan.get("toolId").and_then(Value::as_str) == Some(FLOW_TOOLS_TOOL_ID)
        && plan.get("seedMode").and_then(Value::as_str) == Some("provider")
}

// El soporte global acredita el protocolo, no la disponibilidad de perfiles.
// Como el helper de la extensión, permite metadata adicional en la capability.
fn supports_flow_tools_coordinator(status: &Value) -> bool {
    if status.get("type").and_then(Value::as_str) != Some("bridge.status") {
        return false;
    }
    let Some(capability) = status
        .get("capabilities")
        .and_then(|capabilities| capabilities.get("flowTools"))
        .and_then(Value::as_object)
    else {
        return false;
    };
    capability.get("version").and_then(Value::as_f64) == Some(1.0)
        && capability.get("toolId").and_then(Value::as_str) == Some(FLOW_TOOLS_TOOL_ID)
        && capability.get("seedSupported").and_then(Value::as_bool) == Some(false)
        && capability.get("requestHashVersion").and_then(Value::as_f64) == Some(1.0)
}

fn public_command(command: &Value) -> Result<Value, String> {
    let object = command.as_object().ok_or("flow_command_invalid")?;
    let kind = object
        .get("type")
        .and_then(Value::as_str)
        .ok_or("flow_command_invalid")?;
    let fields: &[&str] = match kind {
        "status" | "discovery.list" | "pairing.new" | "gallery.list" => &["type"],
        "discovery.link" => &["type", "discoveryId"],
        "revoke" => &["type", "connectionId"],
        "pause" => &["type", "paused"],
        "capacity.check" => &["type", "requestedCount", "connectionIds", "executionPlan"],
        // Estas acciones conservan la confirmación explícita en la UI y las
        // comprobaciones de intento/propietario/elegibilidad del coordinador.
        "generation.retry" => &[
            "type",
            "imageJobId",
            "expectedAttemptId",
            "retryRequestId",
            "acknowledgeDuplicateRisk",
        ],
        "download" | "cancel" | "image.delete" | "preview.read" => &["type", "imageJobId"],
        "batch.cancel" | "batch.delete" => &["type", "batchId"],
        _ => return Err("flow_command_invalid".into()),
    };
    if object.keys().any(|key| !fields.contains(&key.as_str())) {
        return Err("flow_command_invalid".into());
    }
    if let Some(plan) = object.get("executionPlan") {
        if !valid_flow_tools_plan(plan) {
            return Err("flow_command_invalid".into());
        }
    }
    if serde_json::to_vec(command)
        .map_err(|_| "flow_command_invalid")?
        .len()
        > 16_384
    {
        return Err("flow_command_invalid".into());
    }
    Ok(command.clone())
}

async fn send_command(
    client: &reqwest::Client,
    endpoint: &str,
    token: &str,
    command: &Value,
) -> Result<Value, String> {
    let response = client
        .post(endpoint)
        .bearer_auth(token)
        .json(command)
        .send()
        .await
        .map_err(|_| "flow_unavailable")?;
    let status = response.status();
    if status.as_u16() == 403 || status.is_server_error() {
        return Err("flow_unavailable".into());
    }
    let envelope: Value = response.json().await.map_err(|_| "flow_unavailable")?;
    if envelope.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(safe_error(envelope.get("code").and_then(Value::as_str)));
    }
    Ok(envelope
        .get("result")
        .cloned()
        .unwrap_or_else(|| json!({"ok":true})))
}

#[tauri::command]
pub async fn flow_command(app: AppHandle, command: Value) -> Result<Value, String> {
    let command = public_command(&command)?;
    let runtime = ensure_runtime(&app).await?;
    let port = runtime
        .get("port")
        .and_then(Value::as_u64)
        .ok_or("flow_unavailable")?;
    let token = runtime
        .get("token")
        .and_then(Value::as_str)
        .ok_or("flow_unavailable")?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(COMMAND_TIMEOUT)
        .build()
        .map_err(|_| "flow_unavailable")?;
    let endpoint = format!("http://127.0.0.1:{port}/command");
    if command.get("executionPlan").is_some() {
        // Ambas lecturas usan el mismo coordinador autenticado. No se sondea
        // soporte con un envío Tools ni se bloquean pausas/comandos RPC.
        let status = send_command(&client, &endpoint, token, &json!({ "type": "status" })).await?;
        if !supports_flow_tools_coordinator(&status) {
            return Err("flow_tools_coordinator_upgrade_required".into());
        }
    }
    send_command(&client, &endpoint, token, &command).await
}

pub fn shutdown(app: &AppHandle) {
    app.state::<FlowService>().stop();
}
