use serde_json::json;

use super::*;

fn exited(code: Option<i32>, signal: Option<i32>) -> TerminatedPayload {
    TerminatedPayload { code, signal }
}

fn code_of(event: Option<&Value>) -> Option<&str> {
    event?.get("code")?.as_str()
}

fn message_of(event: Option<&Value>) -> Option<&str> {
    event?.get("message")?.as_str()
}

#[test]
fn terminal_events_are_job_completed_and_job_failed() {
    assert!(is_terminal_event(&json!({ "type": "job-completed", "result": null })));
    assert!(is_terminal_event(&json!({ "type": "job-failed", "code": "cancelled" })));
}

#[test]
fn progress_and_malformed_events_are_not_terminal() {
    assert!(!is_terminal_event(&json!({ "type": "job-started" })));
    assert!(!is_terminal_event(&json!({ "type": "stage-completed", "stageId": "voice" })));
    assert!(!is_terminal_event(&json!({ "code": "job-failed" })));
    assert!(!is_terminal_event(&json!("job-failed")));
}

#[test]
fn a_process_that_dies_without_a_terminal_event_closes_the_job_as_sidecar_exited() {
    let crash = exited(Some(1), None);

    let event = closing_event("job-1", false, false, Some(&crash));

    // La forma de un job-failed del sidecar (JobFailedEvent con su jobId).
    let expected = json!({
        "type": "job-failed",
        "code": "sidecar_exited",
        "message": "sidecar exited without a terminal event (exit code 1)",
        "jobId": "job-1",
    });
    assert_eq!(event, Some(expected));
}

#[test]
fn the_closing_event_is_terminal_for_the_event_loop() {
    let crash = closing_event("job-1", false, false, Some(&exited(Some(1), None)));
    let cancel = closing_event("job-1", false, true, Some(&exited(None, Some(9))));

    assert!(crash.as_ref().is_some_and(is_terminal_event));
    assert!(cancel.as_ref().is_some_and(is_terminal_event));
}

#[test]
fn the_closing_message_says_how_the_process_ended() {
    let killed = closing_event("job-2", false, false, Some(&exited(None, Some(9))));
    let clean_exit = closing_event("job-2", false, false, Some(&exited(Some(0), None)));
    let no_status = closing_event("job-2", false, false, Some(&exited(None, None)));

    assert_eq!(
        message_of(killed.as_ref()),
        Some("sidecar exited without a terminal event (signal 9)")
    );
    // Salir con 0 sin job-completed tampoco es un final: el job se da por caído.
    assert_eq!(code_of(clean_exit.as_ref()), Some("sidecar_exited"));
    assert_eq!(
        message_of(clean_exit.as_ref()),
        Some("sidecar exited without a terminal event (exit code 0)")
    );
    assert_eq!(
        message_of(no_status.as_ref()),
        Some("sidecar exited without a terminal event (no exit status)")
    );
}

#[test]
fn an_event_stream_that_ends_without_terminated_still_closes_the_job() {
    let event = closing_event("job-3", false, false, None);

    assert_eq!(code_of(event.as_ref()), Some("sidecar_exited"));
    assert_eq!(
        message_of(event.as_ref()),
        Some("sidecar exited without a terminal event (no exit status)")
    );
}

#[test]
fn a_requested_cancellation_closes_the_job_as_cancelled() {
    // El kill de respaldo de cancel_pipeline_job: stdin ya no aceptaba el aviso.
    let killed = closing_event("job-4", false, true, Some(&exited(None, Some(9))));
    // El aviso llegó por stdin y el proceso murió mientras abortaba.
    let died_aborting = closing_event("job-4", false, true, Some(&exited(Some(1), None)));
    let no_status = closing_event("job-4", false, true, None);

    let expected = json!({
        "type": "job-failed",
        "code": "cancelled",
        "message": "sidecar exited without a terminal event (signal 9)",
        "jobId": "job-4",
    });
    assert_eq!(killed, Some(expected));
    assert_eq!(code_of(died_aborting.as_ref()), Some("cancelled"));
    assert_eq!(code_of(no_status.as_ref()), Some("cancelled"));
}

#[test]
fn a_job_never_gets_a_second_terminal_event() {
    let exits = [
        Some(exited(Some(0), None)),
        Some(exited(Some(1), None)),
        Some(exited(None, Some(9))),
        None,
    ];

    for exit in &exits {
        for cancel_requested in [false, true] {
            let event = closing_event("job-5", true, cancel_requested, exit.as_ref());
            assert_eq!(
                event, None,
                "exit {exit:?}, cancel_requested {cancel_requested}"
            );
        }
    }
}
