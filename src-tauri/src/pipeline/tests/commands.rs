use serde_json::json;

use super::*;

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
