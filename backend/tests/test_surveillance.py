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
    detail = client.get(f"/outbreaks/{outbreak_id}", headers=auth["reader"]).json()
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
    alerts = client.get("/alerts", headers=auth["reader"]).json()
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
