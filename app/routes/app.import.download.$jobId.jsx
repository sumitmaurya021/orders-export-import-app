import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import fs from "fs";
import path from "path";

export const loader = async ({ request, params }) => {
  const { jobId } = params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.options) {
    throw new Response("Job not found", { status: 404 });
  }

  const options = JSON.parse(job.options);
  const fileUrl = options.annotatedFileUrl;

  if (!fileUrl || !fs.existsSync(fileUrl)) {
    throw new Response("Annotated file not found on disk", { status: 404 });
  }

  const fileStats = fs.statSync(fileUrl);
  const fileStream = fs.createReadStream(fileUrl);
  const fileName = path.basename(fileUrl);
  
  // Try to determine mime type from extension
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = ext === ".csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new Response(fileStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": fileStats.size.toString(),
    },
  });
};
