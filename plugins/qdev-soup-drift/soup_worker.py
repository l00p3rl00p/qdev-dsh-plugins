"""Invoke the official SOUP drift functions on in-memory values; never write trajectory files."""
import json
import sys
from soup_cli.utils.drift_alarm import compute_token_distribution, rolling_kl, validate_threshold

def evaluate(payload):
    reference, live = payload["reference"], payload["live"]
    threshold = validate_threshold(payload["threshold"])
    if not isinstance(reference, list) or not reference or not isinstance(live, list) or not live:
        raise ValueError("reference and live must be nonempty arrays")
    if any(not isinstance(x, str) or not x.strip() for x in reference + live):
        raise ValueError("reference and live entries must be nonempty text")
    base, current = compute_token_distribution(reference), compute_token_distribution(live)
    if not base or not current: raise ValueError("no comparable output tokens")
    kl = rolling_kl(current, base)
    return {"drift_detected": kl > threshold, "kl_divergence": kl, "threshold": threshold,
            "n_reference": len(reference), "n_live": len(live)}

if __name__ == "__main__":
    try:
        print(json.dumps(evaluate(json.load(sys.stdin))))
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        print(f"SOUP input error: {error}", file=sys.stderr)
        sys.exit(2)
