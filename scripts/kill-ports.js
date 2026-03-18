/**
 * Kill proses yang pakai port server (8787) dan frontend (8080, 8081).
 * Windows: netstat + taskkill. Unix: lsof + kill.
 */
import { execSync, spawnSync } from "node:child_process";
import { platform } from "node:os";

const PORTS = [8787, 8080, 8081];

function getPidsWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const pids = new Set();
    for (const line of out.split("\n")) {
      const m = line.trim().split(/\s+/);
      const pid = m[m.length - 1];
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function getPidsUnix(port) {
  try {
    const out = execSync(`lsof -ti :${port}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function killPids(pids) {
  const isWin = platform() === "win32";
  for (const pid of pids) {
    try {
      if (isWin) {
        spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "inherit" });
      } else {
        process.kill(Number(pid), "SIGTERM");
      }
      console.log(`Kill PID ${pid} OK`);
    } catch (e) {
      console.warn(`Kill PID ${pid}:`, e.message);
    }
  }
}

const isWin = platform() === "win32";
const allPids = new Set();
for (const port of PORTS) {
  const pids = isWin ? getPidsWindows(port) : getPidsUnix(port);
  pids.forEach((p) => allPids.add(p));
}
if (allPids.size === 0) {
  console.log("Tidak ada proses di port", PORTS.join(", "));
  process.exit(0);
}
console.log("Kill proses di port", PORTS.join(", "), "-> PIDs:", [...allPids]);
killPids([...allPids]);
console.log("Selesai.");
