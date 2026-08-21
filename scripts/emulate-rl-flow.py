from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.autoai_api import app


async def asgi_request(method: str, path: str, payload: dict | None = None, query: dict | None = None) -> dict:
    body = b"" if payload is None else json.dumps(payload).encode("utf-8")
    query_string = urlencode(query or {}).encode("utf-8")
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": query_string,
        "headers": [(b"content-type", b"application/json")],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "root_path": "",
    }
    messages: list[dict] = []
    sent = False

    async def receive() -> dict:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict) -> None:
        messages.append(message)

    await app(scope, receive, send)
    status = next((message["status"] for message in messages if message["type"] == "http.response.start"), None)
    response_body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    data = json.loads(response_body.decode("utf-8") or "{}")
    if status is None or status >= 400:
        raise RuntimeError(f"{method} {path} failed with {status}: {data}")
    return {"method": method, "url": path + (f"?{urlencode(query)}" if query else ""), "statusCode": status, "response": data}


async def main() -> None:
    workspace = "rl-emulation-" + datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    log: list[dict] = []

    async def req(method: str, path: str, payload: dict | None = None, query: dict | None = None) -> dict:
        entry = await asgi_request(method, path, payload, query)
        log.append(entry)
        return entry["response"]

    created = await req(
        "POST",
        "/api/rl/session",
        {
            "environment": "desktop-double-pendulum-emulated",
            "workspaceId": workspace,
            "candidateName": "C1-user-emulation",
            "observationSize": 4,
            "actionCount": 3,
            "targetEpisodes": 3,
            "learningRate": 0.12,
            "discount": 0.98,
            "exploration": 0.10,
            "algorithm": "q-learning",
        },
    )
    session_id = created["sessionId"]
    after_create = await req("GET", "/api/rl/environments", query={"workspaceId": workspace})

    for episode in range(1, 4):
        for step in range(4):
            await req(
                "POST",
                f"/api/rl/session/{session_id}/step",
                {
                    "observation": [episode * 0.10, step * -0.05, 0.20 - step * 0.02, -0.10],
                    "action": step % 3,
                    "reward": -1.0 + 0.25 * episode - 0.05 * step,
                    "nextObservation": [episode * 0.08, (step + 1) * -0.04, 0.16 - step * 0.02, -0.06],
                    "done": step == 3,
                    "episode": episode,
                },
            )
        await req(
            "POST",
            f"/api/rl/session/{session_id}/episode",
            {"episode": episode, "totalReward": -4.0 + 1.15 * episode, "steps": 4, "success": episode == 3},
        )

    after_epochs = await req("GET", "/api/rl/environments", query={"workspaceId": workspace})
    policy = await req("GET", f"/api/rl/session/{session_id}/policy")
    deleted_by_session = await req("DELETE", f"/api/rl/session/{session_id}")
    after_session_delete = await req("GET", "/api/rl/environments", query={"workspaceId": workspace})
    second = await req(
        "POST",
        "/api/rl/session",
        {
            "environment": "desktop-double-pendulum-emulated",
            "workspaceId": workspace,
            "candidateName": "C2-ui-delete",
            "observationSize": 4,
            "actionCount": 3,
            "targetEpisodes": 1,
            "learningRate": 0.12,
            "discount": 0.98,
            "exploration": 0.10,
            "algorithm": "q-learning",
        },
    )
    after_second_create = await req("GET", "/api/rl/environments", query={"workspaceId": workspace})
    deleted_by_environment = await req("DELETE", f"/api/rl/environments/{second['sessionId']}")
    after_environment_delete = await req("GET", "/api/rl/environments", query={"workspaceId": workspace})

    print(
        json.dumps(
            {
                "workspace": workspace,
                "sessionId": session_id,
                "requestCount": len(log),
                "environmentsAfterCreate": len(after_create["environments"]),
                "afterEpochs": after_epochs["environments"][0] if after_epochs["environments"] else None,
                "policy": {
                    "policyVersion": policy["policyVersion"],
                    "stateCount": policy["stateCount"],
                    "actionCount": policy["actionCount"],
                },
                "deleteBySession": deleted_by_session,
                "environmentsAfterSessionDelete": len(after_session_delete["environments"]),
                "secondSessionId": second["sessionId"],
                "environmentsAfterSecondCreate": len(after_second_create["environments"]),
                "deleteByEnvironment": deleted_by_environment,
                "environmentsAfterEnvironmentDelete": len(after_environment_delete["environments"]),
                "keyRequests": [log[0], log[1], log[-6], log[-5], log[-4], log[-3], log[-2], log[-1]],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
