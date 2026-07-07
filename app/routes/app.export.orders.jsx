import { useState, useEffect } from "react";
import { useSubmit, useActionData, useNavigation, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ORDER_COLUMNS as ALL_COLUMNS } from "../constants/order-columns";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const countResponse = await admin.graphql(
    `#graphql
    query getOrdersCount {
      ordersCount {
        count
      }
    }`
  );
  const countData = await countResponse.json();
  const count = countData.data?.ordersCount?.count || 0;
  return { totalCount: count };
};


export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const format = formData.get("format");
  const rowMode = formData.get("rowMode");
  const confirmedLargeExport = formData.get("confirmedLargeExport") === "true";
  
  const selectedColumns = formData.getAll("columns");
  
  const queryStr = ""; // No filters anymore

  // Check count
  const countResponse = await admin.graphql(
    `#graphql
    query getOrdersCount {
      ordersCount {
        count
      }
    }`
  );

  const countData = await countResponse.json();
  const count = countData.data?.ordersCount?.count || 0;

  if (count > 200000 && !confirmedLargeExport) {
    return { error: "large_export", count };
  }

  // Create Job
  const job = await prisma.exportJob.create({
    data: {
      shopId: session.shop,
      status: "pending",
      format,
      filters: JSON.stringify({
        query: queryStr,
        columns: selectedColumns,
        rowMode,
        expectedCount: count
      }),
    },
  });

  return { jobId: job.id };
};

export default function ExportOrders() {
  const { totalCount } = useLoaderData();
  const submit = useSubmit();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.jobId) {
      navigate(`/app/export/orders/progress/${actionData.jobId}`);
    }
  }, [actionData, navigate]);

  const [format, setFormat] = useState("xlsx");
  const [rowMode, setRowMode] = useState("lineItem");
  
  // Custom multi-select state for columns
  const [columns, setColumns] = useState(ALL_COLUMNS);
  
  const [confirmedLargeExport, setConfirmedLargeExport] = useState(false);

  const toggleColumn = (col) => {
    if (columns.includes(col)) {
      setColumns(columns.filter(c => c !== col));
    } else {
      setColumns([...columns, col]);
    }
  };

  const handleExport = () => {
    const formData = new FormData();
    formData.append("format", format);
    formData.append("rowMode", rowMode);
    columns.forEach(c => formData.append("columns", c));

    if (confirmedLargeExport) {
      formData.append("confirmedLargeExport", "true");
    }

    submit(formData, { method: "post" });
  };

  const isLargeExportError = actionData?.error === "large_export";

  return (
    <div className="page">
      <div className="page-header">
        <h1>Export Orders</h1>
        <a href="/app" className="btn btn-secondary">Dashboard</a>
      </div>

      <div className="layout">
        <div className="banner banner-info">
          <h3>Total Orders Available: {totalCount.toLocaleString()}</h3>
          <p>You are about to export all {totalCount.toLocaleString()} orders from your store.</p>
        </div>
        {isLargeExportError && (
          <div className="banner banner-warning">
            <h3>Large Export Detected</h3>
            <p>Your filters match {actionData?.count?.toLocaleString()} orders. This is a very large export and will take a long time.</p>
            <div style={{ marginTop: '10px' }} className="checkbox-wrapper">
              <input 
                type="checkbox" 
                id="confirmLarge" 
                checked={confirmedLargeExport}
                onChange={(e) => setConfirmedLargeExport(e.target.checked)}
              />
              <label htmlFor="confirmLarge" style={{cursor:'pointer', color:'inherit'}}>I confirm I want to export more than 200,000 orders.</label>
            </div>
          </div>
        )}

        <div className="card">
          <div className="block-stack">
            <h2>Export Settings</h2>
            
            <div className="inline-stack">
              <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                <label>Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </select>
              </div>
              
              <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                <label>Row Layout</label>
                <select value={rowMode} onChange={(e) => setRowMode(e.target.value)}>
                  <option value="order">One row per Order (Ignore line items)</option>
                  <option value="lineItem">One row per Line Item (Order fields repeat)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="block-stack">
            <h2>Columns</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {ALL_COLUMNS.map((col) => (
                <div key={col} className="checkbox-wrapper">
                  <input 
                    type="checkbox" 
                    id={`col-${col}`} 
                    checked={columns.includes(col)}
                    onChange={() => toggleColumn(col)}
                  />
                  <label htmlFor={`col-${col}`}>{col}</label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="block-stack">
            <h2>Start Export</h2>
            <p className="text-subdued">Click the button below to start the background export process.</p>

            <div className="inline-stack end" style={{ marginTop: '1rem' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleExport} 
                disabled={(isLargeExportError && !confirmedLargeExport) || isSubmitting}
              >
                {isSubmitting ? 'Starting...' : 'Start Export'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
