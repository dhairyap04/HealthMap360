from datetime import date


def test_investigation_links_observations_and_records_activity(client, auth):
    headers = auth["analyst"]
    location = client.post(
        "/locations", headers=headers, json={"name": "Test city", "latitude": 10, "longitude": 20}
    ).json()
    observation = client.post(
        "/cases",
        headers=headers,
        json={
            "location_id": location["id"],
            "date": date.today().isoformat(),
            "disease": "influenza",
            "case_count": 12,
            "severity": "high",
        },
    )
    assert observation.status_code == 201, observation.text
    outbreak = client.post(
        "/outbreaks",
        headers=headers,
        json={
            "title": "Influenza investigation",
            "disease": "influenza",
            "started_on": date.today().isoformat(),
            "location_ids": [location["id"]],
        },
    )
    assert outbreak.status_code == 201, outbreak.text
    outbreak_id = outbreak.json()["id"]
    linked = client.post(
        f"/outbreaks/{outbreak_id}/observations",
        headers=headers,
        json={"action": "attach", "observation_ids": [observation.json()["id"]]},
    )
    assert linked.status_code == 200, linked.text
    detail = client.get(f"/outbreaks/{outbreak_id}", headers=auth["analyst"]).json()
    assert detail["reported_cases"] == 12
    assert detail["observations"] == 1
    assert len(detail["updates"]) == 2
    assert (
        client.post(f"/outbreaks/{outbreak_id}/updates", headers=auth["reader"], json={"body": "forbidden"}).status_code
        == 403
    )


def test_threshold_alert_is_deduplicated_and_can_be_acknowledged(client, auth):
    headers = auth["analyst"]
    location = client.post(
        "/locations", headers=headers, json={"name": "Test city", "latitude": 10, "longitude": 20}
    ).json()
    rule = client.post(
        "/alert-rules",
        headers=headers,
        json={"name": "Influenza threshold", "disease": "influenza", "threshold": 10, "window_days": 7},
    )
    assert rule.status_code == 201, rule.text
    result = client.post(
        "/cases",
        headers=headers,
        json={
            "location_id": location["id"],
            "date": date.today().isoformat(),
            "disease": "influenza",
            "case_count": 12,
            "severity": "high",
        },
    )
    assert result.status_code == 201, result.text
    alerts = client.get("/alerts", headers=auth["analyst"]).json()
    assert len(alerts) == 1 and alerts[0]["value"] == 12
    assert client.post("/alerts/evaluate", headers=headers).json()["created"] == 0
    alert_id = alerts[0]["id"]
    assert (
        client.post(f"/alerts/{alert_id}/action", headers=headers, json={"action": "acknowledge"}).json()["status"]
        == "acknowledged"
    )
    assert (
        client.post(f"/alerts/{alert_id}/action", headers=headers, json={"action": "resolve"}).json()["status"]
        == "resolved"
    )


def test_outbreak_scope_changes_cannot_orphan_linked_cases(client, auth):
    today = date.today().isoformat()
    headers = auth["analyst"]
    city = client.post(
        "/locations", headers=headers, json={"name": "Scope city", "latitude": 10, "longitude": 20}
    ).json()
    row = client.post(
        "/cases",
        headers=headers,
        json={"location_id": city["id"], "date": today, "disease": "influenza", "case_count": 2, "severity": "low"},
    ).json()
    payload = {"title": "Scope test", "disease": "influenza", "started_on": today, "location_ids": [city["id"]]}
    outbreak = client.post("/outbreaks", headers=headers, json=payload).json()
    url = f"/outbreaks/{outbreak['id']}"
    assert (
        client.post(
            url + "/observations", headers=headers, json={"action": "attach", "observation_ids": [row["id"]]}
        ).status_code
        == 200
    )
    assert client.put(url, headers=headers, json={**payload, "disease": "measles"}).status_code == 409
    assert client.get(url, headers=headers).json()["disease"] == "influenza"
    assert client.put(f"/cases/{row['id']}", headers=headers, json={**row, "disease": "measles"}).status_code == 409
    assert client.put(url, headers=headers, json={**payload, "status": "closed"}).status_code == 422
    assert client.put(url, headers=headers, json={**payload, "status": "closed", "ended_on": today}).status_code == 200
    assert (
        client.post(
            url + "/observations", headers=headers, json={"action": "detach", "observation_ids": [row["id"]]}
        ).status_code
        == 409
    )
    assert client.put(url, headers=headers, json={**payload, "status": "active"}).status_code == 200
    assert (
        client.post(
            url + "/observations", headers=headers, json={"action": "detach", "observation_ids": [row["id"]]}
        ).status_code
        == 200
    )
    assert client.get(url, headers=headers).json()["observations"] == 0


def test_alert_window_boundaries_pause_and_count_corrections(client, auth):
    from datetime import timedelta

    headers = auth["analyst"]
    city = client.post(
        "/locations", headers=headers, json={"name": "Window city", "latitude": 0, "longitude": 0}
    ).json()
    rule = {"name": "Window rule", "disease": "influenza", "location_id": city["id"], "threshold": 5, "window_days": 7}
    rule_id = client.post("/alert-rules", headers=headers, json=rule).json()["id"]
    old = client.post(
        "/cases",
        headers=headers,
        json={
            "location_id": city["id"],
            "date": (date.today() - timedelta(days=7)).isoformat(),
            "disease": "influenza",
            "case_count": 50,
            "severity": "high",
        },
    )
    assert old.status_code == 201
    assert client.get("/alerts", headers=headers).json() == []
    current = client.post(
        "/cases",
        headers=headers,
        json={
            "location_id": city["id"],
            "date": (date.today() - timedelta(days=6)).isoformat(),
            "disease": "influenza",
            "case_count": 6,
            "severity": "medium",
        },
    ).json()
    assert client.get("/alerts", headers=headers).json()[0]["status"] == "open"
    assert client.put(f"/cases/{current['id']}", headers=headers, json={**current, "case_count": 2}).status_code == 200
    assert client.get("/alerts", headers=headers).json()[0]["data_state"] == "incomplete"
    assert client.put(f"/alert-rules/{rule_id}", headers=headers, json={**rule, "enabled": False}).status_code == 200
    assert client.post("/alerts/evaluate", headers=headers).json()["evaluated_rules"] == 0
    assert client.post("/alert-rules", headers=auth["reader"], json=rule).status_code == 403


def test_deleted_observation_keeps_its_complete_history(client, auth):
    city = client.post(
        "/locations", headers=auth["analyst"], json={"name": "Audit city", "latitude": 0, "longitude": 0}
    ).json()
    record = client.post(
        "/cases",
        headers=auth["analyst"],
        json={
            "location_id": city["id"],
            "date": date.today().isoformat(),
            "disease": "influenza",
            "case_count": 3,
            "severity": "low",
        },
    ).json()
    assert client.delete(f"/cases/{record['id']}", headers=auth["analyst"]).status_code == 204
    history = client.get(f"/cases/{record['id']}/history", headers=auth["analyst"]).json()
    assert {change["action"] for change in history} == {"create", "delete"}
