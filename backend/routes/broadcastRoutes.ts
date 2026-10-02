import { Router } from "express";
import { BroadcastJob } from "../repositories/SettingsRepository.js";
import { BroadcastService } from "../services/BroadcastService.js";

interface BroadcastRouterDeps {
  getAccount: (accountId: string) => any;
  getAccountSettings: (accountId: string) => any;
  setAccountSettings: (accountId: string, settings: any) => void;
  broadcastLog: (msg: string, type?: "info" | "success" | "error") => void;
}

export function createBroadcastRouter(deps: BroadcastRouterDeps) {
  const router = Router({ mergeParams: true });

  // GET /api/account/:accountId/broadcast-jobs
  router.get("/", (req, res) => {
    const params = req.params as Record<string, string>;
    const accountId = String(params.accountId || "").trim();
    const account = deps.getAccount(accountId);
    if (!account) return res.status(404).json({ error: "Akun tidak ditemukan" });
    const settings = deps.getAccountSettings(accountId);
    res.json({ jobs: settings.broadcastJobs || [] });
  });

  // POST /api/account/:accountId/broadcast-jobs
  router.post("/", (req, res) => {
    const params = req.params as Record<string, string>;
    const accountId = String(params.accountId || "").trim();
    const account = deps.getAccount(accountId);
    if (!account) return res.status(404).json({ error: "Akun tidak ditemukan" });

    const body = req.body as Partial<BroadcastJob>;
    if (!body.targetGroup) {
      return res.status(400).json({ error: "targetGroup wajib diisi" });
    }
    if (!body.items || body.items.length === 0) {
      return res.status(400).json({ error: "Minimal 1 item konten diperlukan" });
    }

    const settings = deps.getAccountSettings(accountId);
    const jobs: BroadcastJob[] = [...(settings.broadcastJobs || [])];

    const genId = () => Math.random().toString(36).slice(2, 10);
    const isNew = !body.id || !jobs.find((j) => j.id === body.id);

    const jobData: BroadcastJob = {
      id: isNew ? genId() : body.id!,
      name: String(body.name || "Broadcast Job"),
      targetGroup: String(body.targetGroup),
      items: (body.items || []).map((item: any) => ({
        text: typeof item.text === "string" ? item.text : "",
        media: Array.isArray(item.media) ? item.media.map(String) : [],
      })),
      intervalMin: Number.isFinite(Number(body.intervalMin)) ? Number(body.intervalMin) : 45,
      intervalMax: Number.isFinite(Number(body.intervalMax)) ? Number(body.intervalMax) : 90,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      keywords: Array.isArray(body.keywords)
        ? body.keywords.map(String).map((k) => k.toLowerCase().trim()).filter(Boolean)
        : [],
    };

    if (isNew) {
      jobs.push(jobData);
      deps.broadcastLog(`[${accountId}] [Broadcaster] Job baru "${jobData.name}" ditambahkan.`, "info");
    } else {
      const idx = jobs.findIndex((j) => j.id === jobData.id);
      jobs[idx] = jobData;
      deps.broadcastLog(`[${accountId}] [Broadcaster] Job "${jobData.name}" diupdate.`, "info");
    }

    deps.setAccountSettings(accountId, { broadcastJobs: jobs });
    res.json({ success: true, job: jobData });
  });

  // POST /api/account/:accountId/broadcast-jobs/:jobId/toggle
  router.post("/:jobId/toggle", (req, res) => {
    const params = req.params as Record<string, string>;
    const accountId = String(params.accountId || "").trim();
    const jobId = String(params.jobId || "").trim();
    const account = deps.getAccount(accountId);
    if (!account) return res.status(404).json({ error: "Akun tidak ditemukan" });

    const settings = deps.getAccountSettings(accountId);
    const jobs: BroadcastJob[] = [...(settings.broadcastJobs || [])];
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return res.status(404).json({ error: "Job tidak ditemukan" });

    jobs[idx] = { ...jobs[idx], isActive: !jobs[idx].isActive };
    const newActive = jobs[idx].isActive;

    deps.setAccountSettings(accountId, { broadcastJobs: jobs });
    deps.broadcastLog(
      `[${accountId}] [Broadcaster] Job "${jobs[idx].name}" ${newActive ? "DIAKTIFKAN" : "DINONAKTIFKAN"}.`,
      newActive ? "success" : "error",
    );
    res.json({ success: true, isActive: newActive });
  });

  // DELETE /api/account/:accountId/broadcast-jobs/:jobId
  router.delete("/:jobId", (req, res) => {
    const params = req.params as Record<string, string>;
    const accountId = String(params.accountId || "").trim();
    const jobId = String(params.jobId || "").trim();
    const account = deps.getAccount(accountId);
    if (!account) return res.status(404).json({ error: "Akun tidak ditemukan" });

    const settings = deps.getAccountSettings(accountId);
    const jobs = (settings.broadcastJobs || []).filter((j) => j.id !== jobId);
    const removed = (settings.broadcastJobs || []).length !== jobs.length;
    if (!removed) return res.status(404).json({ error: "Job tidak ditemukan" });

    BroadcastService.stopJob(accountId, jobId);
    deps.setAccountSettings(accountId, { broadcastJobs: jobs });
    deps.broadcastLog(`[${accountId}] [Broadcaster] Job dihapus.`, "info");
    res.json({ success: true });
  });

  return router;
}
