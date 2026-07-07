import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import fs from "fs";
import path from "path";

export const loader = async ({ request, params }) => {
  const { jobId } = params;

  const job = await prisma.exportJob.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.fileUrl) {
    throw new Response("File not found", { status: 404 });
  }

  if (!fs.existsSync(job.fileUrl)) {
    throw new Response("File no longer exists on disk", { status: 404 });
  }

  const fileStats = fs.statSync(job.fileUrl);
  const fileStream = fs.createReadStream(job.fileUrl);
  const fileName = path.basename(job.fileUrl);
  const mimeType = job.format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new Response(fileStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": fileStats.size.toString(),
    },
  });
};
