import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import fs from "fs";
import path from "path";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId, shopId: session.shop },
  });

  if (!job || !job.options) {
    throw new Response("File not found", { status: 404 });
  }

  const options = JSON.parse(job.options);
  const filePath = options.annotatedFileUrl;
  
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Response("Annotated file no longer exists on disk", { status: 404 });
  }

  const file = fs.readFileSync(filePath);
  const ext = path.extname(filePath);
  const mimeType = ext === ".csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="import-result-${jobId}${ext}"`,
    },
  });
};
