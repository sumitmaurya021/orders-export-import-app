import { useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
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
  const { job: initialJob } = useLoaderData();
  const fetcher = useFetcher();

  const job = fetcher.data?.job || initialJob;

  const isCompleted = job.status === "completed" || job.status === "failed";
  const successCount = job.processedRows - job.errorCount;
  const progress = job.totalRows > 0 ? (job.processedRows / job.totalRows) * 100 : 0;

  let options = {};
  try {
    options = job.options ? JSON.parse(job.options) : {};
  } catch(e) {}

  useEffect(() => {
    let intervalId;
    if (!isCompleted) {
      intervalId = setInterval(() => {
        fetcher.load(`/app/import/orders/summary/${job.id}`);
      }, 3000);
    }
    return () => clearInterval(intervalId);
  }, [isCompleted, job.id, fetcher]);

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

            <p className="text-subdued">File: <strong>{options.originalName || "Uploaded File"}</strong></p>

            <div className="block-stack" style={{ gap: '0.5rem', marginBottom: '1rem', marginTop: '0.5rem' }}>
              <p style={{ margin: 0 }}>Rows Processed: <strong>{job.processedRows}</strong> {job.totalRows > 0 ? `of ${job.totalRows}` : ''}</p>
              
              {!isCompleted && (
                <div className="progress-container" style={{ margin: '0.5rem 0' }}>
                  <div className="progress-bar" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                </div>
              )}

              <div className="inline-stack" style={{ gap: '1.5rem', marginTop: '0.5rem' }}>
                <span className="text-success" style={{ fontWeight: 500 }}>✔️ Success: {successCount}</span>
                {job.warningCount > 0 && <span className="text-warning" style={{ fontWeight: 500 }}>⚠️ Warnings: {job.warningCount}</span>}
                {job.errorCount > 0 && <span className="text-critical" style={{ fontWeight: 500 }}>❌ Errors: {job.errorCount}</span>}
              </div>
            </div>

            {!isCompleted && (
              <div className="banner banner-info">
                <h3>Importing orders in background</h3>
                <p>Your spreadsheet is being processed. The system will update you automatically when it finishes.</p>
              </div>
            )}

            {job.status === "completed" && (
              <div className="banner banner-success" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--success)', marginTop: '1rem' }}>
                <h3>Import Completed Successfully!</h3>
                <p style={{ marginBottom: job.errorCount > 0 || job.warningCount > 0 ? '1rem' : '0' }}>
                  Shopify orders have been created/updated matching the instructions in your file.
                </p>
                {(job.errorCount > 0 || job.warningCount > 0) && options.annotatedFileUrl && (
                  <div className="block-stack" style={{ gap: '0.5rem' }}>
                    <p style={{ margin: 0 }} className="text-subdued">
                      Some rows had errors or warnings. Download the annotated file to inspect error details for each row.
                    </p>
                    <div style={{ marginTop: '0.5rem' }}>
                      <a href={`/app/import/download/${job.id}`} className="btn btn-primary" target="_blank" rel="noreferrer">
                        Download Annotated File
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {job.status === "failed" && (
              <div className="banner banner-critical" style={{ marginTop: '1rem' }}>
                <h3>Import Failed</h3>
                <p>There was a critical error processing your import job. Please verify your file structure and try again.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
