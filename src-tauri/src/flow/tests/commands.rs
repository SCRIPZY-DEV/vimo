use super::*;

#[test]
fn capacity_preserves_recovery_contract_and_tools_plan() {
    let command = json!({"type":"capacity.check","requestedCount":20,"autoRecoveryVersion":1,
        "executionPlan":{"version":1,"kind":"flow-tools","toolId":FLOW_TOOLS_TOOL_ID,"seedMode":"provider"}});
    assert_eq!(public_command(&command), Ok(command.clone()));
    let legacy = json!({"type":"capacity.check","requestedCount":1});
    assert_eq!(public_command(&legacy), Ok(legacy.clone()));
}

#[test]
fn capacity_rejects_invalid_recovery_versions_and_extra_authority() {
    for version in [
        json!(0),
        json!(2),
        json!("1"),
        json!([1]),
        json!(true),
        json!(null),
    ] {
        let command =
            json!({"type":"capacity.check","requestedCount":1,"autoRecoveryVersion":version});
        assert_eq!(public_command(&command), Err("flow_command_invalid".into()));
    }
    assert!(public_command(
        &json!({"type":"capacity.check","requestedCount":1,"autoRecoveryVersion":1,"force":true})
    )
    .is_err());
    assert!(public_command(&json!({"type":"status","autoRecoveryVersion":1})).is_err());
    assert!(public_command(&json!({"type":"submit","autoRecoveryVersion":1})).is_err());
}
