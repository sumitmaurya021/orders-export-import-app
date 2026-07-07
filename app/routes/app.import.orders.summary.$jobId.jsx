import { useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  Button,
  InlineStack,
  Banner,
} from "@shopify/polaris";
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

  return (
    <Page title="Import Summary" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Job Status</Text>
                {job.status === "completed" && <Badge tone="success">Completed</Badge>}
                {job.status === "failed" && <Badge tone="critical">Failed</Badge>}
                {job.status === "processing" && <Badge tone="attention">Processing</Badge>}
                {job.status === "pending" && <Badge>Pending</Badge>}
              </InlineStack>

              <BlockStack gap="200">
                <Text tone="subdued">Rows Processed: {job.processedRows}</Text>
                <Text tone="success">Successful: {successCount}</Text>
                <Text tone="warning">Warnings: {job.warningCount}</Text>
                <Text tone="critical">Errors: {job.errorCount}</Text>
              </BlockStack>

              {!isCompleted && (
                <Banner tone="info" title="Import is running">
                  <p>Your orders are currently being processed in the background. Refresh this page in a few moments.</p>
                </Banner>
              )}

              {isCompleted && options.annotatedFileUrl && (
                <InlineStack align="start">
                  <Button variant="primary" url={`/app/import/download/${job.id}`} external>
                    Download Annotated File
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
