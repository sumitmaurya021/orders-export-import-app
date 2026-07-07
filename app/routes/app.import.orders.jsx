import { useState, useCallback } from "react";
import { useSubmit, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  DropZone,
  Text,
  BlockStack,
  Thumbnail,
  Banner,
} from "@shopify/polaris";
import { NoteIcon } from "@shopify/polaris-icons";
import {
  unstable_parseMultipartFormData,
  unstable_createFileUploadHandler,
} from "@shopify/remix-server-runtime";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import fs from "fs";
import path from "path";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Setup file upload to local tmp directory
  const uploadHandler = unstable_createFileUploadHandler({
    directory: path.join(process.cwd(), "tmp"),
    maxPartSize: 50_000_000, // 50MB
    file: ({ filename }) => `${Date.now()}-${filename}`,
  });

  const formData = await unstable_parseMultipartFormData(request, uploadHandler);
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return { error: "No valid file uploaded." };
  }

  const filePath = file.filepath;

  const createCustomers = formData.get("createCustomers") === "true";

  // Create an ImportJob in 'review' status
  const job = await prisma.importJob.create({
    data: {
      shopId: session.shop,
      status: "review", // A custom status before 'pending' for review phase
      fileUrl: filePath,
      options: JSON.stringify({ originalName: file.name, createCustomers }),
    },
  });

  // Redirect to review page
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/app/import/orders/review/${job.id}`,
    },
  });
};

export default function ImportOrders() {
  const [file, setFile] = useState(null);
  const [createCustomers, setCreateCustomers] = useState(false);
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const handleDropZoneDrop = useCallback(
    (_dropFiles, acceptedFiles, _rejectedFiles) => {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);

      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("createCustomers", createCustomers ? "true" : "false");
        submit(formData, { method: "post", encType: "multipart/form-data" });
      }
    },
    [submit, createCustomers]
  );

  const fileUpload = !file && <DropZone.FileUpload actionHint="Accepts .xlsx or .csv" />;
  const uploadedFile = file && (
    <BlockStack align="center" inlineAlign="center">
      <Thumbnail
        size="small"
        alt={file.name}
        source={NoteIcon}
      />
      <div>
        {file.name} <Text variant="bodySm" as="p">{Math.round(file.size / 1024)} kb</Text>
      </div>
    </BlockStack>
  );

  return (
    <Page
      title="Upload Orders"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="critical" title="CRITICAL: Disable Auto-Fulfillment">
              <p>Before importing orders, please go to your <b>Shopify Admin &rarr; Settings &rarr; Checkout &rarr; Order processing</b> and ensure <strong>"Automatically fulfill the order's line items"</strong> is <b>OFF</b>. Otherwise, importing historical orders will trigger real shipping confirmation emails to your customers!</p>
            </Banner>

            <Banner tone="info" title="Upload Requirements">
              <p>Please upload a single Excel (.xlsx) or CSV (.csv) file containing only Orders. Make sure it contains columns like ID, Name, Command, etc.</p>
              <div style={{ marginTop: '10px' }}>
                <Checkbox
                  label="Create missing customers (If email is provided but no customer exists in Shopify)"
                  checked={createCustomers}
                  onChange={setCreateCustomers}
                />
              </div>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Upload File
                </Text>
                <div style={{ height: 200 }}>
                  <DropZone
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    type="file"
                    onDrop={handleDropZoneDrop}
                    allowMultiple={false}
                    disabled={isSubmitting}
                  >
                    {uploadedFile}
                    {fileUpload}
                  </DropZone>
                </div>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
