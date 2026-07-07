import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseOrderFile } from "../services/order-file-parser.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId, shopId: session.shop },
  });

  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  const analysis = await parseOrderFile(job.fileUrl);

  return { job, analysis };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;
  const formData = await request.formData();
  
  const totalRows = parseInt(formData.get("totalRows"), 10) || 0;

  const job = await prisma.importJob.update({
    where: { id: jobId, shopId: session.shop },
    data: {
      status: "pending", 
      totalRows,
      processedRows: 0,
      errorCount: 0,
      warningCount: 0,
    },
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/app",
    },
  });
};

export default function ImportReview() {
  const { job, analysis } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const handleStartImport = () => {
    const formData = new FormData();
    formData.append("totalRows", analysis.totalOrderCount);
    submit(formData, { method: "post" });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Recognized":
        return <span className="badge badge-success">Recognized</span>;
      case "Export Only":
        return <span className="badge badge-warning">Export Only</span>;
      case "Unknown":
        return <span className="badge badge-critical">Unknown</span>;
      default:
        return <span className="badge badge-default">{status}</span>;
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Review Import</h1>
        <a href="/app/import/orders" className="btn btn-secondary">Cancel</a>
      </div>

      <div className="layout">
        <div className="banner banner-info">
          <h3>File Parsed Successfully</h3>
          <p>We found {analysis.totalOrderCount} distinct orders (based on ID/Name grouping) across {analysis.totalRows} total rows.</p>
        </div>

        {analysis.columns.some((c) => c.status === "Unknown") && (
          <div className="banner banner-warning">
            <h3>Unknown Columns Detected</h3>
            <p>Some columns in your file are not recognized. These will be ignored during the import process.</p>
          </div>
        )}

        <div className="card">
          <div className="block-stack">
            <h2>Column Mapping</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Column Header (from file)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.columns.map((col, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: 500 }}>{col.name}</td>
                      <td>{getStatusBadge(col.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="inline-stack end" style={{ marginTop: '1rem' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleStartImport} 
                disabled={isSubmitting}
              >
                Start Background Import
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
