import { useState, useCallback, useRef, useEffect } from "react";
import { useSubmit, useNavigation, useNavigate, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import fs from "fs";
import path from "path";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return { error: "No file uploaded" };
  }

  const uploadDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filePath = path.join(uploadDir, `${Date.now()}-${file.name}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const createCustomers = formData.get("createCustomers") === "true";

  const job = await prisma.importJob.create({
    data: {
      shopId: session.shop,
      status: "review",
      fileUrl: filePath,
      options: JSON.stringify({ originalName: file.name, createCustomers }),
    },
  });

  return { jobId: job.id };
};

export default function ImportOrders() {
  const [file, setFile] = useState(null);
  const [createCustomers, setCreateCustomers] = useState(false);
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const actionData = useActionData();
  const isSubmitting = navigation.state === "submitting";
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (actionData?.jobId) {
      navigate(`/app/import/orders/review/${actionData.jobId}`);
    }
  }, [actionData, navigate]);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        setFile(droppedFile);
        submitFile(droppedFile, createCustomers);
      }
    },
    [createCustomers]
  );

  const handleChange = useCallback(
    (e) => {
      const selectedFile = e.target.files[0];
      if (selectedFile) {
        setFile(selectedFile);
        submitFile(selectedFile, createCustomers);
      }
    },
    [createCustomers]
  );

  const submitFile = (f, createCust) => {
    const formData = new FormData();
    formData.append("file", f);
    formData.append("createCustomers", createCust ? "true" : "false");
    submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Import Orders</h1>
        <a href="/app" className="btn btn-secondary">Back to Dashboard</a>
      </div>

      <div className="layout">
        <div className="banner banner-warning">
          <h3>Critical Fulfillment Rules</h3>
          <p>
            Shopify API strict validation: You CANNOT modify line items or prices on an existing order if it has been partially or fully fulfilled. 
            Modifying fulfilled orders will result in API errors. Use the "UPDATE" command to safely update only Tags, Notes, or Custom Attributes.
          </p>
        </div>

        <div className="banner banner-info">
          <h3>Upload Requirements</h3>
          <p>Please upload a single Excel (.xlsx) or CSV (.csv) file containing only Orders. Make sure it contains columns like ID, Name, Command, etc.</p>
          <div style={{ marginTop: '10px' }} className="checkbox-wrapper">
            <input 
              type="checkbox" 
              id="createCustomers" 
              checked={createCustomers}
              onChange={(e) => setCreateCustomers(e.target.checked)}
            />
            <label htmlFor="createCustomers" style={{ cursor: 'pointer' }}>
              Create missing customers (If email is provided but no customer exists in Shopify)
            </label>
          </div>
        </div>

        <div className="card">
          <div className="block-stack">
            <h2>File Upload</h2>
            
            <div 
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div className="block-stack">
                  <div className="inline-stack" style={{ justifyContent: 'center' }}>
                    <span style={{ fontSize: '2rem' }}>📄</span>
                    <span style={{ fontWeight: '600' }}>{file.name}</span>
                  </div>
                  {isSubmitting && <p className="text-subdued">Uploading and parsing file...</p>}
                </div>
              ) : (
                <div className="block-stack">
                  <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📥</span>
                  <h3>Click or drop file to upload</h3>
                  <p>Accepts .xlsx or .csv</p>
                </div>
              )}
              
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".xlsx,.csv"
                onChange={handleChange}
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
