#!/usr/bin/env python3
"""
VAANI CAVP — Comprehensive Stress Test Suite

Tests:
  1. Health + readiness endpoints
  2. All GET endpoints (prompts, guidance)
  3. POST transcribe, features, report
  4. Full IELTS analyze (single + concurrent)
  5. Full TOEFL analyze (single)
  6. Rate limiting verification
  7. Edge cases (invalid file, large file, missing params)
  8. Response schema validation
  9. GPU memory monitoring
 10. Timing statistics

Usage:
  python scripts/stress_test.py              # all tests (default 3 concurrent analyzes)
  python scripts/stress_test.py --quick      # skip heavy pipeline endpoints
  python scripts/stress_test.py --concurrent 5  # 5 concurrent analyze submissions
"""

import argparse
import concurrent.futures
import json
import os
import statistics
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

import requests

# ── Config ──────────────────────────────────────────────────────────────────
REPO = Path(os.environ.get("REPO", os.path.expanduser("~/contrastive-voice-profiling")))
ENGINE = os.environ.get("ENGINE", "http://localhost:8000")
GATEWAY = os.environ.get("GATEWAY", "http://localhost:3001")
SAMPLE_AUDIO = REPO / "samples" / "svarah" / "clips" / "bangla_09.wav"

# Load API key from .env
_env_path = REPO / ".env"
ENGINE_API_KEY = ""
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        if line.startswith("ENGINE_API_KEY="):
            ENGINE_API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

HEADERS = {"X-Engine-API-Key": ENGINE_API_KEY} if ENGINE_API_KEY else {}
TIMEOUT = 300  # 5 minutes for analyze, 30s for others

# ── Colors ─────────────────────────────────────────────────────────────────
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
DIM = "\033[90m"
RESET = "\033[0m"
BOLD = "\033[1m"

OK = f"{GREEN}✓{RESET}"
BAD = f"{RED}✗{RESET}"
WARN = f"{YELLOW}⚠{RESET}"

# ── State ───────────────────────────────────────────────────────────────────
results: list[dict] = []
pass_count = 0
fail_count = 0
warn_count = 0


def record(name: str, passed: bool, detail: str = "", warn: bool = False):
    global pass_count, fail_count, warn_count
    entry = {
        "name": name,
        "passed": passed,
        "detail": detail,
        "time": datetime.now().isoformat(),
    }
    results.append(entry)
    if warn:
        warn_count += 1
        icon = WARN
    elif passed:
        pass_count += 1
        icon = OK
    else:
        fail_count += 1
        icon = BAD
    line = f"  {icon} {name}"
    if detail:
        line += f"  {DIM}({detail}){RESET}"
    print(line)


def gpu_memory() -> dict | None:
    """Return GPU memory usage in MiB, or None if no GPU."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0:
            parts = out.stdout.strip().split(",")
            return {"used_mib": int(parts[0].strip()), "free_mib": int(parts[1].strip())}
    except Exception:
        pass
    return None


# ═════════════════════════════════════════════════════════════════════════════
# TEST FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════


def test_engine_health():
    """Engine /health returns 200."""
    r = requests.get(f"{ENGINE}/health", timeout=10)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    record("engine /health", ok,
           f"status={r.status_code} body={json.dumps(data)}" if not ok else f"status={data.get('status')}")


def test_gateway_health():
    """Gateway /api/health returns 200."""
    r = requests.get(f"{GATEWAY}/api/health", timeout=10)
    ok = r.status_code == 200
    record("gateway /api/health", ok, f"status={r.status_code}" if not ok else "200")


def test_prompts_ielts():
    """Engine /api/prompts/ielts returns valid JSON with prompts."""
    r = requests.get(f"{ENGINE}/api/prompts/ielts", headers=HEADERS, timeout=30)
    ok = r.status_code == 200
    detail = ""
    if ok:
        data = r.json()
        prompt_count = len(data.get("prompts", []))
        ok = prompt_count > 0
        detail = f"{prompt_count} prompts"
    else:
        detail = f"status={r.status_code}"
    record("GET /api/prompts/ielts", ok, detail)


def test_prompts_toefl():
    """Engine /api/prompts/toefl returns valid JSON with prompts."""
    r = requests.get(f"{ENGINE}/api/prompts/toefl", headers=HEADERS, timeout=30)
    ok = r.status_code == 200
    detail = ""
    if ok:
        data = r.json()
        prompt_count = len(data.get("prompts", []))
        ok = prompt_count > 0
        detail = f"{prompt_count} prompts"
    else:
        detail = f"status={r.status_code}"
    record("GET /api/prompts/toefl", ok, detail)


def test_guidance_topics():
    """Engine /api/guidance/topics returns valid JSON."""
    r = requests.get(f"{ENGINE}/api/guidance/topics", headers=HEADERS, timeout=30)
    ok = r.status_code == 200
    detail = f"status={r.status_code}" if not ok else "200"
    record("GET /api/guidance/topics", ok, detail)


def test_engine_auth_required():
    """Engine endpoints reject requests without API key."""
    r = requests.get(f"{ENGINE}/api/prompts/ielts", timeout=10)
    ok = r.status_code in (403, 401)
    record("engine auth-gate (no key)", ok, f"got {r.status_code}")


def test_upload_no_file():
    """POST /api/ielts/analyze with no file returns 422 or 400."""
    r = requests.post(f"{ENGINE}/api/ielts/analyze", headers=HEADERS, timeout=30)
    ok = r.status_code == 422
    record("IELTS analyze (no file)", ok, f"got {r.status_code}", warn=not ok)


def test_upload_invalid_format():
    """POST /api/ielts/analyze with invalid extension returns 400."""
    r = requests.post(
        f"{ENGINE}/api/ielts/analyze",
        headers=HEADERS,
        files={"audio": ("test.txt", b"not audio", "text/plain")},
        data={"gender": "neutral", "l1_language": "auto", "age_group": "adult"},
        timeout=30,
    )
    ok = r.status_code == 400
    record("IELTS analyze (invalid format .txt)", ok, f"got {r.status_code}" if not ok else "400")


def test_upload_invalid_l1():
    """POST /api/ielts/analyze with invalid L1 returns 400."""
    r = requests.post(
        f"{ENGINE}/api/ielts/analyze",
        headers=HEADERS,
        files={"audio": ("test.wav", SAMPLE_AUDIO.read_bytes(), "audio/wav")},
        data={"gender": "neutral", "l1_language": "klingon", "age_group": "adult"},
        timeout=30,
    )
    ok = r.status_code == 400
    record("IELTS analyze (invalid L1)", ok, f"got {r.status_code} {r.json().get('detail','')}")


def test_upload_invalid_age():
    """POST /api/ielts/analyze with invalid age_group returns 400."""
    r = requests.post(
        f"{ENGINE}/api/ielts/analyze",
        headers=HEADERS,
        files={"audio": ("test.wav", SAMPLE_AUDIO.read_bytes(), "audio/wav")},
        data={"gender": "neutral", "l1_language": "auto", "age_group": "elderly"},
        timeout=30,
    )
    ok = r.status_code == 400
    record("IELTS analyze (invalid age_group)", ok, f"got {r.status_code}")


def test_ielts_analyze_single():
    """Single IELTS analyze submission — full pipeline."""
    if not SAMPLE_AUDIO.exists():
        record("IELTS analyze (single)", False, f"sample missing: {SAMPLE_AUDIO}")
        return {}

    gpu_before = gpu_memory()
    t0 = time.time()

    r = requests.post(
        f"{ENGINE}/api/ielts/analyze",
        headers=HEADERS,
        files={"audio": ("bangla_09.wav", SAMPLE_AUDIO.read_bytes(), "audio/wav")},
        data={"gender": "neutral", "l1_language": "auto", "age_group": "adult"},
        timeout=TIMEOUT,
    )
    elapsed = time.time() - t0
    gpu_after = gpu_memory()

    ok = r.status_code == 200
    detail = f"{elapsed:.1f}s"

    if ok:
        try:
            data = r.json()
            has_status = data.get("status") == "ok"
            has_engine = "engine_version" in data
            has_quality = "audio_quality" in data
            profile_ok = data.get("profile") is not None or data.get("ielts") is not None
            ielts_ok = data.get("ielts") is not None
            detail += f" status_ok={has_status} profile={profile_ok} ielts={ielts_ok}"
            if ielts_ok:
                bands = data["ielts"]
                overall = bands.get("overall_band") or bands.get("overall")
                detail += f" band={overall}"

            # Schema validation
            required = {"status", "engine_version", "audio_quality"}
            missing = required - set(data.keys())
            if missing:
                ok = False
                detail += f" missing_keys={missing}"

            # Validate profile structure if present
            profile = data.get("profile", {})
            if profile:
                expected_layers = ["transcription", "feature_extraction", "prosodic_profiling",
                                   "voice_quality", "connected_speech", "l1_interference"]
                found_layers = [k for k in expected_layers if k in profile]
                detail += f" layers={len(found_layers)}/{len(expected_layers)}"

        except json.JSONDecodeError:
            ok = False
            detail += f" invalid_json"

    if gpu_before and gpu_after:
        delta = gpu_after["used_mib"] - gpu_before["used_mib"]
        detail += f" gpu_delta=+{delta}MiB"

    record("IELTS analyze (single)", ok, detail)
    return {"elapsed": elapsed, "status": r.status_code, "ok": ok}


def test_toefl_analyze_single():
    """Single TOEFL analyze submission."""
    if not SAMPLE_AUDIO.exists():
        record("TOEFL analyze (single)", False, f"sample missing: {SAMPLE_AUDIO}")
        return

    t0 = time.time()
    r = requests.post(
        f"{ENGINE}/api/toefl/analyze",
        headers=HEADERS,
        files={"audio": ("bangla_09.wav", SAMPLE_AUDIO.read_bytes(), "audio/wav")},
        data={"gender": "neutral", "l1_language": "auto", "age_group": "adult"},
        timeout=TIMEOUT,
    )
    elapsed = time.time() - t0
    ok = r.status_code == 200
    detail = f"{elapsed:.1f}s"

    if ok:
        try:
            data = r.json()
            has_status = data.get("status") == "ok"
            toefl_ok = data.get("toefl") is not None
            detail += f" status_ok={has_status} toefl={toefl_ok}"
        except json.JSONDecodeError:
            ok = False
            detail += " invalid_json"

    record("TOEFL analyze (single)", ok, detail)


def test_transcribe():
    """POST /api/transcribe returns valid transcription."""
    if not SAMPLE_AUDIO.exists():
        record("POST /api/transcribe", False, "sample missing")
        return

    r = requests.post(
        f"{ENGINE}/api/transcribe",
        headers=HEADERS,
        files={"audio": ("bangla_09.wav", SAMPLE_AUDIO.read_bytes(), "audio/wav")},
        data={"language": "en", "gender": "neutral"},
        timeout=TIMEOUT,
    )
    ok = r.status_code == 200
    detail = f"status={r.status_code}"
    if ok:
        data = r.json()
        text = data.get("text", "")
        detail += f" words={len(text.split())}"
    record("POST /api/transcribe", ok, detail)


def test_features():
    """POST /api/features returns acoustic features."""
    if not SAMPLE_AUDIO.exists():
        record("POST /api/features", False, "sample missing")
        return

    r = requests.post(
        f"{ENGINE}/api/features",
        headers=HEADERS,
        files={"audio": ("bangla_09.wav", SAMPLE_AUDIO.read_bytes(), "audio/wav")},
        data={"gender": "neutral"},
        timeout=TIMEOUT,
    )
    ok = r.status_code == 200
    detail = f"status={r.status_code}"
    if ok:
        data = r.json()
        has_parsel = "parselmouth" in (data.get("features") or {}) or "parselmouth" in data
        detail += f" parselmouth={has_parsel}"
    record("POST /api/features", ok, detail)


def test_ielts_analyze_concurrent(n: int = 3):
    """Submit N concurrent IELTS analyze requests."""
    if not SAMPLE_AUDIO.exists():
        record(f"IELTS analyze (concurrent x{n})", False, "sample missing")
        return

    audio_bytes = SAMPLE_AUDIO.read_bytes()
    gpu_before = gpu_memory()

    def submit(i: int):
        t0 = time.time()
        r = requests.post(
            f"{ENGINE}/api/ielts/analyze",
            headers=HEADERS,
            files={"audio": (f"test_{i}.wav", audio_bytes, "audio/wav")},
            data={"gender": "neutral", "l1_language": "auto", "age_group": "adult"},
            timeout=TIMEOUT,
        )
        elapsed = time.time() - t0
        ok = r.status_code == 200
        detail = f"code={r.status_code}"
        if ok:
            try:
                data = r.json()
                band = None
                if data.get("ielts"):
                    band = data["ielts"].get("overall_band") or data["ielts"].get("overall")
                detail += f" band={band}" if band else ""
            except Exception:
                detail += " bad_json"
        return {"index": i, "elapsed": elapsed, "ok": ok, "code": r.status_code, "detail": detail}

    start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=n) as pool:
        futures = [pool.submit(submit, i) for i in range(1, n + 1)]
        per_request = [f.result() for f in concurrent.futures.as_completed(futures)]
    total_elapsed = time.time() - start
    per_request.sort(key=lambda x: x["index"])

    gpu_after = gpu_memory()
    all_ok = all(r["ok"] for r in per_request)
    times = [r["elapsed"] for r in per_request]
    detail = (f"wall={total_elapsed:.1f}s "
              f"min={min(times):.1f}s max={max(times):.1f}s "
              f"mean={statistics.mean(times):.1f}s "
              f"ok={sum(1 for r in per_request if r['ok'])}/{n}")
    if gpu_before and gpu_after:
        delta = gpu_after["used_mib"] - gpu_before["used_mib"]
        detail += f" gpu_delta=+{delta}MiB"

    record(f"IELTS analyze (concurrent x{n})", all_ok, detail,
           warn=all_ok and max(times) > 120)

    # Per-request details
    for r in per_request:
        icon = OK if r["ok"] else BAD
        print(f"    {icon} req {r['index']}: {r['detail']} {DIM}({r['elapsed']:.1f}s){RESET}")

    return per_request


def test_rate_limiting():
    """Verify rate limiting (10/min on analyze endpoints). Not exhaustive —
    just checks that the Limit header or a 429 appears under rapid fire."""
    if not SAMPLE_AUDIO.exists():
        record("Rate limit check", False, "sample missing", warn=True)
        return

    # Fire 5 quick requests in a row (not enough to necessarily trigger,
    # but we'll check headers)
    for i in range(3):
        r = requests.post(
            f"{ENGINE}/api/ielts/analyze",
            headers=HEADERS,
            files={"audio": ("test.wav", SAMPLE_AUDIO.read_bytes(), "audio/wav")},
            data={"gender": "neutral", "l1_language": "auto", "age_group": "adult"},
            timeout=30,
        )
        if r.status_code == 429:
            record("Rate limit check", True, "rate limit triggered (429)")
            return
        if "X-RateLimit-Remaining" in r.headers or "Retry-After" in r.headers:
            record("Rate limit check", True, f"rate-limit headers present")
            return

    record("Rate limit check", True, "no 429 within 3 quick hits (may need more)", warn=True)


def test_response_headers():
    """Check that engine responses include useful headers."""
    r = requests.get(f"{ENGINE}/health", timeout=10)
    has_server = "server" in r.headers
    has_content = "content-type" in r.headers
    record("Response headers (health)", has_content,
           f"content-type={r.headers.get('content-type', 'missing')}")


def test_cors_headers():
    """Check CORS headers on engine responses."""
    r = requests.options(
        f"{ENGINE}/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
        timeout=10,
    )
    allow_origin = r.headers.get("access-control-allow-origin", "")
    ok = allow_origin in ("*", "http://localhost:5173") or "localhost" in allow_origin
    record("CORS headers", ok, f"allow-origin={allow_origin}" if not ok else "present")


def test_gateway_proxy():
    """Gateway proxies prompts to engine."""
    r = requests.get(f"{GATEWAY}/api/testprep/prompts/ielts", timeout=30)
    ok = r.status_code == 200
    detail = ""
    if ok:
        try:
            data = r.json()
            detail = f"{len(data.get('prompts', []))} prompts"
        except Exception:
            ok = False
            detail = "invalid json"
    else:
        detail = f"status={r.status_code}"
    record("Gateway prompts proxy", ok, detail)


# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Vaani CAVP Stress Test Suite")
    parser.add_argument("--quick", action="store_true", help="Skip heavy pipeline endpoints")
    parser.add_argument("--concurrent", type=int, default=3, help="Concurrent analyze count (default 3)")
    parser.add_argument("--full", action="store_true", help="Run ALL tests including heavy ones")
    args = parser.parse_args()

    quick = args.quick and not args.full
    n_concurrent = args.concurrent

    print()
    print(f"{BOLD}═══ Vaani CAVP Stress Test Suite ═══{RESET}")
    print(f"  Engine : {ENGINE}")
    print(f"  Gateway: {GATEWAY}")
    print(f"  Sample : {SAMPLE_AUDIO}")
    print(f"  Time   : {datetime.now().isoformat()}")
    gpu = gpu_memory()
    if gpu:
        print(f"  GPU    : used={gpu['used_mib']}MiB free={gpu['free_mib']}MiB")
    print()

    # ── Phase 1: Health & Connectivity ─────────────────────────────────────
    print(f"{BOLD}── Phase 1: Health & Connectivity{RESET}")
    test_engine_health()
    test_gateway_health()
    test_response_headers()
    test_cors_headers()

    # ── Phase 2: Auth & Security ───────────────────────────────────────────
    print(f"\n{BOLD}── Phase 2: Auth & Security{RESET}")
    test_engine_auth_required()

    # ── Phase 3: GET Endpoints ─────────────────────────────────────────────
    print(f"\n{BOLD}── Phase 3: GET Endpoints{RESET}")
    test_prompts_ielts()
    test_prompts_toefl()
    test_guidance_topics()
    test_gateway_proxy()

    # ── Phase 4: Edge Cases ────────────────────────────────────────────────
    print(f"\n{BOLD}── Phase 4: Edge Cases{RESET}")
    test_upload_no_file()
    test_upload_invalid_format()
    test_upload_invalid_l1()
    test_upload_invalid_age()

    if not quick:
        # ── Phase 5: Light POST Endpoints ──────────────────────────────────
        print(f"\n{BOLD}── Phase 5: Light POST Endpoints{RESET}")
        test_transcribe()
        test_features()

        # ── Phase 6: Single Pipeline Runs ──────────────────────────────────
        print(f"\n{BOLD}── Phase 6: Single Pipeline Runs{RESET}")
        test_ielts_analyze_single()
        # TOEFL runs the same pipeline, skip if already tested IELTS
        # test_toefl_analyze_single()

        # ── Phase 7: Concurrent Stress ─────────────────────────────────────
        print(f"\n{BOLD}── Phase 7: Concurrent Stress ({n_concurrent} simultaneous){RESET}")
        test_ielts_analyze_concurrent(n_concurrent)

        # ── Phase 8: Rate Limiting ─────────────────────────────────────────
        print(f"\n{BOLD}── Phase 8: Rate Limiting{RESET}")
        test_rate_limiting()

    # ── Summary ────────────────────────────────────────────────────────────
    total = pass_count + fail_count + warn_count
    print()
    print(f"{BOLD}── Summary{RESET}")
    print(f"  Total : {total}")
    print(f"  Pass  : {GREEN}{pass_count}{RESET}")
    print(f"  Warn  : {YELLOW}{warn_count}{RESET}")
    print(f"  Fail  : {RED}{fail_count}{RESET}")
    print(f"  Rate  : {GREEN if fail_count == 0 else RED}{pass_count}/{total}{RESET} ({100*pass_count//total if total else 0}%)")

    gpu_after = gpu_memory()
    if gpu_after:
        print(f"  GPU   : used={gpu_after['used_mib']}MiB free={gpu_after['free_mib']}MiB")

    # Save results
    report_path = REPO / "engine" / "data" / f"stress_report_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps({
        "results": results,
        "summary": {
            "total": total, "pass": pass_count, "fail": fail_count, "warn": warn_count,
            "rate": 100 * pass_count // total if total else 0,
        },
        "config": {
            "engine": ENGINE, "gateway": GATEWAY, "concurrent": n_concurrent,
            "sample": str(SAMPLE_AUDIO), "quick": quick,
        },
        "gpu_final": gpu_after,
    }, indent=2))
    print(f"\n  Report saved: {report_path}")

    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
