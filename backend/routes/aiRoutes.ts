import { Router } from "express";
import { AiConfigRepository } from "../repositories/AiConfigRepository.js";
import { AIService } from "../services/AIService.js";

export const aiRouter = Router();

aiRouter.get("/config", (_req, res) => {
  res.json(AiConfigRepository.getConfig());
});

aiRouter.post("/config", (req, res) => {
  const updatedConfig = AiConfigRepository.updateConfig(req.body);
  res.json({ success: true, config: updatedConfig });
});

aiRouter.post("/test", async (req, res) => {
  const { mode, input } = req.body;
  const aiConfig = AiConfigRepository.getConfig();

  if (!aiConfig.isActive || aiConfig.apiKeys.length === 0) {
    return res
      .status(400)
      .json({ error: "AI Service nonaktif atau API Key kosong." });
  }

  try {
    let result;
    if (mode === "blocked") {
      result = await AIService.generateBlockedWordVariants(
        input,
        aiConfig.apiKeys,
      );
    } else if (mode === "keyword") {
      result = await AIService.generateKeywordVariants(input, aiConfig.apiKeys);
    } else if (mode === "debug") {
      result = await AIService.analyzeErrorLog(input, aiConfig.apiKeys);
    }

    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
