import { useEffect } from "react";
import { useFetcher, useNavigate, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const imports = await prisma.importJob.findMany({
    where: { shopId: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  const exports = await prisma.exportJob.findMany({
    where: { shopId: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  const allJobs = [
    ...imports.map(j => ({ ...j, type: "Import" })),
    ...exports.map(j => ({ ...j, type: "Export" }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  return { jobs: allJobs };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "import") {
    return new Response(null, {
      status: 302,
      headers: { Location: "/app/import/orders" },
    });
  }
  
  if (actionType === "export") {
    return new Response(null, {
      status: 302,
      headers: { Location: "/app/export/orders" },
    });
  }

  return null;
};

export default function Index() {
  const { jobs: initialJobs } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const jobs = fetcher.data?.jobs || initialJobs || [];

  const isPolling = jobs.some(j => j.status === "processing" || j.status === "pending"); 

  useEffect(() => {
    let intervalId;
    if (isPolling) {
      intervalId = setInterval(() => {
        fetcher.load("/app");
      }, 3000);
    }
    return () => clearInterval(intervalId);
  }, [isPolling, fetcher]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed": return <span className="badge badge-success">Completed</span>;
      case "processing": return <span className="badge badge-info">Processing</span>;
      case "failed": return <span className="badge badge-critical">Failed</span>;
      default: return <span className="badge badge-default">{status}</span>;
    }
  };

  const handleCreateJob = (type) => {
    const fd = new FormData();
    fd.append("actionType", type);
    fetcher.submit(fd, { method: "post" });
  };

  const isLoading = fetcher.state !== "idle";

  return (
    <div className="page">
      <div className="page-header">
        <h1>Orders Sync</h1>
      </div>
      
      <div className="layout">
        <div className="card">
          <div className="block-stack">
            <h2>Import & Export Orders</h2>
            <p>Manage your orders via spreadsheets (XLSX/CSV). Create, update, replace, merge, or delete orders using our bulk import tool, or export your existing orders.</p>
            <div className="inline-stack">
              <button 
                className="btn btn-primary"
                onClick={() => navigate("/app/import/orders")} 
              >
                Import Orders
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => navigate("/app/export/orders")} 
              >
                Export Orders
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="block-stack">
            <h2>Recent Jobs</h2>
            
            {jobs.length === 0 ? (
              <div className="empty-state">
                <p>Run your first import or export to see it here.</p>
              </div>
            ) : (
              <div className="block-stack">
                {jobs.map((job) => {
                  const isImport = job.type === "Import";
                  const progress = isImport
                    ? job.totalRows > 0 ? (job.processedRows / job.totalRows) * 100 : 0
                    : job.itemCount > 0 ? 100 : 0;

                  return (
                    <div key={job.id} className="box">
                      <div className="inline-stack space-between">
                        <div>
                          <h3>{job.type} Job</h3>
                          <p style={{marginBottom: 0, fontSize: '0.875rem'}}>{new Date(job.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="inline-stack">
                          {job.status === "processing" && (
                            <div style={{width: '100px'}}>
                              <div className="progress-container">
                                <div className="progress-bar" style={{width: `${progress}%`}}></div>
                              </div>
                            </div>
                          )}
                          {getStatusBadge(job.status)}
                          <button 
                            className="btn btn-plain"
                            onClick={() => navigate(isImport ? `/app/import/orders/summary/${job.id}` : `/app/export/orders/progress/${job.id}`)}
                          >
                            View Details
                          </button>
                          {job.status === "completed" && (isImport ? (job.options && JSON.parse(job.options).annotatedFileUrl) : job.fileUrl) && (
                            <a 
                              href={isImport ? `/app/import/download/${job.id}` : `/app/export/download/${job.id}`}
                              className="btn btn-plain"
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#10b981', textDecoration: 'none' }}
                            >
                              Download File
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
