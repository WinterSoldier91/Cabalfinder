import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:4000";
const targetMint = __ENV.TARGET_MINT || "2odHeumkiJx46YyNHeZvDjMwsoNhpAgFQuipT96npump";
const jsonHeaders = { "Content-Type": "application/json" };

export const options = {
  scenarios: {
    status_smoke: {
      executor: "constant-arrival-rate",
      rate: 2,
      timeUnit: "1s",
      duration: "10s",
      preAllocatedVUs: 2
    },
    scan_stress: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "10s", target: 2 },
        { duration: "20s", target: 4 },
        { duration: "10s", target: 0 }
      ],
      gracefulRampDown: "5s",
      exec: "scanFlow"
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.1"],
    http_req_duration: ["p(95)<30000"] // Scans are slow (Helius calls)
  }
};

export default function statusFlow() {
  const response = http.get(`${baseUrl}/v1/system/status`);
  check(response, {
    "status 200": (r) => r.status === 200,
    "status ok": (r) => r.json("ok") === true
  });
  sleep(1);
}

export function scanFlow() {
  const response = http.post(
    `${baseUrl}/v1/scans/active`,
    JSON.stringify({ mint: targetMint, topResults: 5 }),
    { headers: jsonHeaders }
  );

  check(response, {
    "scan status 200": (r) => r.status === 200,
    "scan response ok": (r) => r.json("ok") === true,
    "has results": (r) => Array.isArray(r.json("results"))
  });
  sleep(2);
}
