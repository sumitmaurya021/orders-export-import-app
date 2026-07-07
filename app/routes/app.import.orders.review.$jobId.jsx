import { useState } from "react";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Banner,
  DataTable,
  Badge,
  Button,
  Checkbox,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseOrderFile } from "../services/order-file-parser.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId, shopId: session.shop },
  });

  if (!job || job.status !== "review") {
    throw new Response("Job not found or already processed", { status: 404 });
  }

  try {
    const analysis = await parseOrderFile(job.fileUrl);
    return { job, analysis };
  } catch (error) {
    return { job, error: error.message };
  }
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;
  const formData = await request.formData();
  
  if (formData.get("actionType") === "start_import") {
    const totalRows = parseInt(formData.get("totalRows") || "0", 10);
    
    await prisma.importJob.update({
      where: { id: jobId, shopId: session.shop },
      data: {
        status: "pending",
        totalRows: totalRows
      },
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/app",
      },
    });
  }

  return { error: "Invalid action" };
};

export default function ReviewImport() {
  const { job, analysis, error } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [confirmedLargeImport, setConfirmedLargeImport] = useState(false);

  if (error) {
    return (
      <Page title="Review Import" backAction={{ content: "Upload", url: "/app/import/orders" }}>
        <Layout>
          <Layout.Section>
            <Banner tone="critical" title="Error parsing file">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const { headers, totalRows, distinctOrders } = analysis;
  const isLargeFile = totalRows > 50000;
  
  const canSubmit = !isLargeFile || confirmedLargeImport;

  const handleStartImport = () => {
    const formData = new FormData();
    formData.append("actionType", "start_import");
    formData.append("totalRows", totalRows.toString());
    submit(formData, { method: "post" });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Recognized":
        return <Badge tone="success">✅ Recognized</Badge>;
      case "Export Only":
        return <Badge tone="warning">⚠️ Export Only</Badge>;
      case "Unknown":
      default:
        return <Badge tone="critical">❌ Unknown</Badge>;
    }
  };

  const tableRows = headers.map((h) => [
    h.name,
    getStatusBadge(h.status),
  ]);

  return (
    <Page
      title="Review Import"
      backAction={{ content: "Upload", url: "/app/import/orders" }}
    >
      <Layout>
        {isLargeFile && (
          <Layout.Section>
            <Banner tone="warning" title="Large File Detected">
              <p>Your file contains {totalRows.toLocaleString()} rows. Processing this many rows might take a while.</p>
              <div style={{ marginTop: '10px' }}>
                <Checkbox
                  label="I confirm that I want to process this large file."
                  checked={confirmedLargeImport}
                  onChange={setConfirmedLargeImport}
                />
              </div>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                File Summary
              </Text>
              <InlineStack gap="400">
                <BlockStack gap="100">
                  <Text tone="subdued">Total Rows</Text>
                  <Text variant="headingLg">{totalRows.toLocaleString()}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text tone="subdued">Distinct Orders</Text>
                  <Text variant="headingLg">{distinctOrders.toLocaleString()}</Text>
                </BlockStack>
              </InlineStack>

              <Text as="h3" variant="headingSm">
                Column Mapping
              </Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Column Name", "Status"]}
                rows={tableRows}
              />

              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleStartImport}
                  disabled={!canSubmit}
                  loading={isSubmitting}
                >
                  Start Import
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
