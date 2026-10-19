"""Check the resident audit inventory and cited artifacts; this cannot prove claims.

Requires frozen GitHub JSON bodies for issues 322–328. --inventory emits canonical
requirements. --require-complete refuses any unresolved row. All checks are read-only.
"""
import argparse
import copy
import hashlib
import json
import pathlib
import re
import sys

STATUSES = {"proven", "partial", "unverified", "contradicted", "deferred"}


def section(body, heading, following):
    if heading not in body or following not in body:
        raise ValueError(f"Missing requirement section: {heading} or {following}")
    return body.split(heading, 1)[1].split(following, 1)[0]


def inventory(directory):
    bodies = {}
    issues = []
    for number in range(322, 329):
        record = json.loads((directory / f"{number}.json").read_text())
        body = record["body"]
        if not isinstance(body, str):
            raise ValueError(f"Issue{number} body is not text")
        bodies[number] = body
        issues.append({"number": number, "bodySha256": hashlib.sha256(body.encode()).hexdigest()})
    rows = []
    stories = section(bodies[322], "## User Stories", "## Implementation Decisions")
    for number, text in re.findall(r"^(\d+)\. (.+)$", stories, re.MULTILINE):
        rows.append({"id": f"322.{number}", "requirement": text})
    if len(rows) != 50:
        raise ValueError("Expected 50 parent stories")
    clauses = section(bodies[322], "## Implementation Decisions", "## Out of Scope")
    decisions = []
    for paragraph in clauses.split("\n\n"):
        if not paragraph.strip() or paragraph.startswith("#"):
            continue
        if paragraph.startswith("- "):
            decisions.extend(line[2:] for line in paragraph.splitlines() if line.startswith("- "))
        else:
            decisions.append(paragraph)
    for number, text in enumerate(decisions, 1):
        rows.append({"id": f"322.D{number}", "requirement": text})
    child_count = 0
    for number in range(323, 329):
        criteria = bodies[number].split("## Acceptance criteria", 1)[1].split("\n## ", 1)[0]
        texts = re.findall(r"^- \[[ x]\] (.+)$", criteria, re.MULTILINE)
        child_count += len(texts)
        rows.extend({"id": f"{number}.{index}", "requirement": text} for index, text in enumerate(texts, 1))
    if child_count != 68:
        raise ValueError("Expected 68 child criteria")
    macos_amendment = "### Native macOS qualification deferral — 2026-10-18"
    optional = ["322.41"] if all(
        macos_amendment in bodies[number]
        and "native macOS execution is optional and nonblocking for completion" in bodies[number]
        for number in (322, 328)
    ) else []
    return {"issues": issues, "requirements": rows, "optionalRequirements": optional}


def is_complete(audit, expected):
    """Keep every row; only the frozen, explicitly amended Mac run may defer."""
    optional = set(expected["optionalRequirements"])
    return all(row["status"] == "proven" or
        (row["status"] == "deferred" and row["id"] in optional)
        for row in audit["rows"])


def check(audit, expected, repo, check_paths=True):
    if audit.get("issues") != expected["issues"]:
        raise ValueError("Issue body hashes differ from the frozen requirements")
    if not re.fullmatch(r"[0-9a-f]{40}", audit.get("candidate", "")):
        raise ValueError("Candidate must identify a full Git commit")
    if check_paths and not isinstance(audit.get("evidenceSha256"), dict):
        raise ValueError("Evidence content hashes are required")
    digests = {}
    wanted = {row["id"]: row["requirement"] for row in expected["requirements"]}
    seen = set()
    counts = dict.fromkeys(sorted(STATUSES), 0)
    for row in audit["rows"]:
        key = row["id"]
        if key in seen or key not in wanted:
            raise ValueError(f"Duplicate or unexpected requirement:{key}")
        seen.add(key)
        if row["requirement"] != wanted[key]:
            raise ValueError(f"Requirement text changed:{key}")
        status = row["status"]
        if status not in STATUSES:
            raise ValueError(f"Unknown status:{key}")
        counts[status] += 1
        evidence = row["evidence"]
        if not isinstance(evidence, list) or not all(isinstance(item, str) and item for item in evidence):
            raise ValueError(f"Invalid evidence list:{key}")
        if status == "proven" and not evidence:
            raise ValueError(f"Proven row has no evidence:{key}")
        if not isinstance(row["gap"], str) or (status != "proven" and not row["gap"].strip()):
            raise ValueError(f"Unresolved row has no concrete gap:{key}")
        if not check_paths:
            continue
        for entry in evidence:
            path_part = entry.split("#", 1)[0]
            match = re.fullmatch(r"(.+):(\d+)", path_part)
            evidence_key = match[1] if match else path_part
            path = pathlib.Path(evidence_key)
            if not path.is_absolute():
                path = repo / path
            if not path.is_file():
                raise ValueError(f"Missing evidence:{key}:{entry}")
            digest = digests.get(evidence_key)
            if digest is None:
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                digests[evidence_key] = digest
            if audit["evidenceSha256"].get(evidence_key) != digest:
                raise ValueError(f"Evidence content changed:{key}:{entry}")
            if match and not 0 < int(match[2]) <= len(path.read_text().splitlines()):
                raise ValueError(f"Invalid evidence line:{key}:{entry}")
    if seen != set(wanted):
        raise ValueError("Missing requirements:" + ",".join(sorted(set(wanted) - seen)))
    return counts


def self_test(expected):
    sample = {"candidate": "a" * 40, "issues": expected["issues"], "rows": [
        {**row, "status": "unverified", "evidence": [], "gap": "Test fixture: no proof."}
        for row in expected["requirements"]
    ]}
    check(sample, expected, pathlib.Path.cwd(), False)
    assert not is_complete(sample, expected)
    finished = copy.deepcopy(sample)
    for row in finished["rows"]:
        row.update(status="proven", evidence=["self-test-evidence"], gap="")
    assert is_complete(finished, expected)
    macos = next(row for row in finished["rows"] if row["id"] == "322.41")
    macos.update(status="deferred", gap="Explicit user deferral")
    assert is_complete(finished, expected) == ("322.41" in expected["optionalRequirements"])
    blocking = {**expected, "optionalRequirements": []}
    assert not is_complete(finished, blocking)
    linux = next(row for row in finished["rows"] if row["id"] == "322.42")
    linux.update(status="deferred", gap="Still required")
    assert not is_complete(finished, expected)
    broken = []
    missing = copy.deepcopy(sample)
    missing["rows"].pop()
    broken.append(missing)
    duplicate = copy.deepcopy(sample)
    duplicate["rows"].append(duplicate["rows"][0])
    broken.append(duplicate)
    changed = copy.deepcopy(sample)
    changed["rows"][0]["requirement"] = "Different scope"
    broken.append(changed)
    unsupported = copy.deepcopy(sample)
    unsupported["rows"][0].update(status="proven", evidence=[])
    broken.append(unsupported)
    unknown = copy.deepcopy(sample)
    unknown["rows"][0]["status"] = "looks-finished"
    broken.append(unknown)
    for value in broken:
        try:
            check(value, expected, pathlib.Path.cwd(), False)
        except ValueError:
            continue
        raise ValueError("Self-test accepted an invalid audit")
    source = str(pathlib.Path(__file__).resolve())
    concrete = copy.deepcopy(sample)
    concrete["rows"][0].update(status="proven", evidence=[source])
    concrete["evidenceSha256"] = {source: hashlib.sha256(pathlib.Path(source).read_bytes()).hexdigest()}
    check(concrete, expected, pathlib.Path.cwd())
    physical = []
    changed_hash = copy.deepcopy(concrete)
    changed_hash["evidenceSha256"][source] = "0" * 64
    physical.append(changed_hash)
    invalid_line = copy.deepcopy(concrete)
    invalid_line["rows"][0]["evidence"] = [source + ":" + str(len(pathlib.Path(source).read_text().splitlines()) + 1)]
    physical.append(invalid_line)
    missing_file = copy.deepcopy(concrete)
    missing_file["rows"][0]["evidence"] = [source + "/missing"]
    physical.append(missing_file)
    for value in physical:
        try:
            check(value, expected, pathlib.Path.cwd())
        except ValueError:
            continue
        raise ValueError("Self-test accepted changed/missing evidence")
    return {"acceptedInventories": 2, "rejectedInvalidAudits": len(broken) + len(physical), "scopeDeferralChecks": 5}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requirements-dir", required=True, type=pathlib.Path)
    parser.add_argument("--audit", type=pathlib.Path)
    parser.add_argument("--repo-root", type=pathlib.Path, default=pathlib.Path.cwd())
    parser.add_argument("--inventory", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    expected = inventory(args.requirements_dir)
    if args.inventory:
        print(json.dumps(expected, indent=2))
        return 0
    if args.self_test:
        print(json.dumps(self_test(expected)))
        return 0
    if args.audit is None:
        parser.error("--audit is required unless emitting inventory or running self-tests")
    audit = json.loads(args.audit.read_text())
    counts = check(audit, expected, args.repo_root)
    complete = is_complete(audit, expected)
    print(json.dumps({"inventoryConsistent": True, "counts": counts, "complete": complete,
                      "optionalRequirements": expected["optionalRequirements"],
                      "limitation": "Inventory, content identity and artifact availability do not prove semantic claims."}))
    return 1 if args.require_complete and not complete else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
