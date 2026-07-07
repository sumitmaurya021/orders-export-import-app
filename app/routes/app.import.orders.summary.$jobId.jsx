import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId, shopId: session.shop },
  });

  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  return { job };
};

export default function ImportSummary() {
  const { job } = useLoaderData();

  const isCompleted = job.status === "completed" || job.status === "failed";
  const successCount = job.processedRows - job.errorCount;

  let options = {};
  try {
    options = job.options ? JSON.parse(job.options) : {};
  } catch(e) {}

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed": return <span className="badge badge-success">Completed</span>;
      case "failed": return <span className="badge badge-critical">Failed</span>;
      case "processing": return <span className="badge badge-info">Processing</span>;
      default: return <span className="badge badge-default">Pending</span>;
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Import Summary</h1>
        <a href="/app" className="btn btn-secondary">Dashboard</a>
      </div>

      <div className="layout">
        <div className="card">
          <div className="block-stack">
            <div className="inline-stack space-between">
              <h2>Job Status</h2>
              {getStatusBadge(job.status)}
            </div>

            <div className="block-stack" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
              <p className="text-subdued" style={{ margin: 0 }}>Rows Processed: {job.processedRows}</p>
              <p className="text-success" style={{ margin: 0, fontWeight: 500 }}>Successful: {successCount}</p>
              <p className="text-warning" style={{ margin: 0, fontWeight: 500 }}>Warnings: {job.warningCount}</p>
              <p className="text-critical" style={{ margin: 0, fontWeight: 500 }}>Errors: {job.errorCount}</p>
            </div>

            {!isCompleted && (
              <div className="banner banner-info">
                <h3>Import is running</h3>
                <p>Your orders are currently being processed in the background. Refresh this page in a few moments.</p>
              </div>
            )}

            {isCompleted && options.annotatedFileUrl && (
              <div className="inline-stack">
                <a href={`/app/import/download/${job.id}`} className="btn btn-primary" target="_blank" rel="noreferrer">
                  Download Annotated File
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
