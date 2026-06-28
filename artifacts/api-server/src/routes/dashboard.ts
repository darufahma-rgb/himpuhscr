import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// cwd is artifacts/api-server/ — go 2 levels up to reach workspace root
const WORKSPACE_ROOT = path.resolve(process.cwd(), "../..");
const HTML_FILE = path.join(WORKSPACE_ROOT, "scraper", "dashboard-live.html");
const DATA_FILE = path.join(WORKSPACE_ROOT, "himpuh-travel.json");
const PROGRESS_FILE = path.join(WORKSPACE_ROOT, "progress.json");

function readJson(filePath: string, fallback: unknown) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

router.get("/dashboard/data", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(readJson(DATA_FILE, []));
});

router.get("/dashboard/progress", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(readJson(PROGRESS_FILE, {}));
});

router.get("/dashboard/download/csv", (_req, res) => {
  const file = path.join(WORKSPACE_ROOT, "himpuh-travel.csv");
  if (!fs.existsSync(file)) { res.status(404).send("File tidak ditemukan"); return; }
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="himpuh-travel-${today}.csv"`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(fs.readFileSync(file));
});

router.get("/dashboard/download/json", (_req, res) => {
  const file = path.join(WORKSPACE_ROOT, "himpuh-travel.json");
  if (!fs.existsSync(file)) { res.status(404).send("File tidak ditemukan"); return; }
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="himpuh-travel-${today}.json"`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(fs.readFileSync(file));
});

router.get("/dashboard", (_req, res) => {
  if (!fs.existsSync(HTML_FILE)) {
    res.status(404).send(`Dashboard HTML not found at: ${HTML_FILE}`);
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(fs.readFileSync(HTML_FILE, "utf8"));
});

export default router;
