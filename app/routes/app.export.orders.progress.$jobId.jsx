import { useEffect } from "react";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;

  const job = await prisma.exportJob.findUnique({
    where: { id: jobId, shopId: session.shop },
  });

  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  return { job };
};

export default function ExportProgress() {
  const { job: initialJob } = useLoaderData();
  const fetcher = useFetcher();

  const job = fetcher.data?.job || initialJob;

  const isCompleted = job.status === "completed" || job.status === "failed";
  const expectedCount = job.filters ? JSON.parse(job.filters).expectedCount || 0 : 0;
  
  const progress = expectedCount > 0 ? (job.itemCount / expectedCount) * 100 : 0;

  useEffect(() => {
    let intervalId;
    if (!isCompleted) {
      intervalId = setInterval(() => {
        fetcher.load(`/app/export/orders/progress/${job.id}`);
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
        <h1>Export Progress</h1>
        <a href="/app" className="btn btn-secondary">Dashboard</a>
      </div>

      <div className="layout">
        <div className="card">
          <div className="block-stack">
            <div className="inline-stack space-between">
              <h2>Job Status</h2>
              {getStatusBadge(job.status)}
            </div>

            <p className="text-subdued">Format: <strong>{job.format.toUpperCase()}</strong></p>

            <div className="block-stack" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ margin: 0 }}>Items Processed: <strong>{job.itemCount}</strong> {expectedCount > 0 ? `of ~${expectedCount}` : ''}</p>
              
              {!isCompleted && (
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                </div>
              )}
            </div>

            {!isCompleted && (
              <div className="banner banner-info">
                <h3>Export is running</h3>
                <p>Your orders are currently being exported in the background. The file will be available to download once completed.</p>
              </div>
            )}

            {job.status === "completed" && job.fileUrl && (
              <div className="banner banner-success" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--success)' }}>
                <h3>Export Successful!</h3>
                <p style={{ marginBottom: '1rem' }}>Your file is ready.</p>
                <a href={`/app/export/download/${job.id}`} className="btn btn-primary" target="_blank" rel="noreferrer">
                  Download Exported File
                </a>
              </div>
            )}

            {job.status === "failed" && (
              <div className="banner banner-critical">
                <h3>Export Failed</h3>
                <p>There was an error while exporting your orders. Please try again.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div style={{ padding: "2rem", color: "red", background: "white" }}>
      <h1>Error in Progress Page!</h1>
      <pre>{error.message || JSON.stringify(error, null, 2)}</pre>
      <pre>{error.stack}</pre>
    </div>
  );
}
