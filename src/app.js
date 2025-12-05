import express from "express";
import client from "prom-client";
import pinoHttp from "pino-http";
import YAML from "yamljs";
import { PrismaClient } from "@prisma/client";
import { apiReference } from "@scalar/express-api-reference";

function env(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    if (fallback === undefined) {
      throw new Error(`Missing env: ${name}`);
    }
    return fallback;
  }
  return raw;
}

const PORT = Number(env("PORT", "3000"));
env("DATABASE_URL");

const prisma = new PrismaClient();

const app = express();
app.use(express.json());

// Scalar API reference
const openapi = YAML.load("./openapi.yaml");

app.get("/openapi.json", (_req, res) => res.json(openapi));

app.use(
  "/docs",
  apiReference({
    spec: { url: "/openapi.json" },
    theme: "default",
    darkMode: true
  })
);

app.use(pinoHttp());

// Prometheus metrics
client.collectDefaultMetrics();
const noteCreatedCounter = new client.Counter({
  name: "svc_notes_note_created_total",
  help: "Total number of notes created"
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

// Health endpoints
app.get("/healthz", (_req, res) => res.send("OK"));

app.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.send("READY");
  } catch {
    res.status(500).send("NOT READY");
  }
});

// Notes endpoints

// List notes for a lecture
app.get("/api/lectures/:lectureId/notes", async (req, res, next) => {
  try {
    const { lectureId } = req.params;

    const notes = await prisma.note.findMany({
      where: { lecture_id: lectureId },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        lecture_id: true,
        user_id: true,
        content: true,
        created_at: true
      }
    });

    res.json(notes);
  } catch (err) {
    next(err);
  }
});

// Create note for a lecture
app.post("/api/lectures/:lectureId/notes", async (req, res, next) => {
  try {
    const { lectureId } = req.params;
    const { user_id, content } = req.body || {};

    if (!content) {
      return res.status(400).json({ error: "Content is required!" });
    }

    const note = await prisma.note.create({
      data: { lecture_id: lectureId, user_id, content },
      select: {
        id: true,
        lecture_id: true,
        user_id: true,
        content: true,
        created_at: true
      }
    });

    noteCreatedCounter.inc();
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

// Error handling
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Start + graceful shutdown
const server = app.listen(PORT, () => {
  console.log("Notes service listening on port", PORT);
});

function shutdown() {
  console.log("Shutting down server...");
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
