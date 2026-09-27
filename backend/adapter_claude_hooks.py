"""CONNECTED-mode adapter: Claude Code lifecycle hooks → workshop activity.

Follows the documented Claude Code hooks reference
(https://code.claude.com/docs/en/hooks).

Hard rules for this adapter:
- Hook payloads become *agent-reported activity* events only (provenance
  ``adapter-mapped``). They can never create receipts; only the gate mints
  receipts, and the gate never sees adapter traffic.
- Raw prompts, tool inputs, transcripts, commands, and working directories are
  redacted at the boundary. Only metadata crosses: event name, tool name,
  session id, agent id.
- Unknown event names, oversized bodies, and non-JSON are rejected.
"""
from __future__ import annotations

from typing import Any

MAX_BODY_BYTES = 64 * 1024

# Documented hook events this adapter accepts. Each maps to agent activity.
SUPPORTED_EVENTS = {
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "Notification",
    "PermissionRequest",
}

# Fields that must never cross into the browser. Everything else in the
# payload is dropped except the allowlisted metadata below.
REDACTED_FIELDS = {
    "prompt", "tool_input", "transcript", "command", "cwd", "file_path",
    "content", "message", "input", "output", "result",
}


def _redacted_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("session_id", "agent_id", "agent_type", "tool_name", "hook_event_name"):
        value = payload.get(key)
        if isinstance(value, str) and value and len(value) <= 256:
            meta[key] = value
    return meta


def validate_hook_payload(body: Any) -> tuple[bool, dict[str, Any] | str]:
    """Return (True, normalized) or (False, error_code). Never raises."""
    if not isinstance(body, dict):
        return False, "HOOK_BODY_NOT_OBJECT"
    event = body.get("hook_event_name") or body.get("hookEventName")
    if not isinstance(event, str) or event not in SUPPORTED_EVENTS:
        return False, "HOOK_EVENT_UNSUPPORTED"
    tool_name = body.get("tool_name") or body.get("toolName") or ""
    if not isinstance(tool_name, str) or len(tool_name) > 128:
        return False, "HOOK_TOOL_NAME_INVALID"
    normalized = {
        "hook_event_name": event,
        "tool_name": tool_name,
        "session_id": body.get("session_id") or body.get("sessionId") or "",
        "agent_id": body.get("agent_id") or body.get("agentId") or "",
    }
    return True, normalized


def describe_activity(normalized: dict[str, Any]) -> str:
    """Plain-English activity line for a validated hook payload."""
    event = normalized["hook_event_name"]
    tool = normalized.get("tool_name") or ""
    session = (normalized.get("session_id") or "")[:8]
    where = f" (session {session}…)" if session else ""
    lines = {
        "SessionStart": f"A Claude Code session began{where}.",
        "SessionEnd": f"A Claude Code session ended{where}.",
        "UserPromptSubmit": f"A new instruction arrived{where}.",
        "PreToolUse": f"The agent started {tool or 'a tool'}{where}." if tool else f"The agent started a tool{where}.",
        "PostToolUse": f"The agent finished {tool or 'a tool'}{where}." if tool else f"The agent finished a tool{where}.",
        "PostToolUseFailure": f"A {tool or 'tool'} call failed{where}." if tool else f"A tool call failed{where}.",
        "Stop": f"The agent finished responding{where}.",
        "SubagentStart": f"A subagent started{where}.",
        "SubagentStop": f"A subagent finished{where}.",
        "Notification": f"The agent raised a notification{where}.",
        "PermissionRequest": f"The agent asked permission for {tool or 'a tool'}{where}." if tool else f"The agent asked permission{where}.",
    }
    return lines.get(event, f"Hook event {event}{where}.")
