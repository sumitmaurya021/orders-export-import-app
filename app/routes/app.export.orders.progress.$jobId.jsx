import { useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  ProgressBar,
  Badge,
  Button,
  InlineStack,
} from "@shopify/polaris";
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
  const isPolling = job.status === "pending" || job.status === "processing";

  useEffect(() => {
    let intervalId;
    if (isPolling) {
      intervalId = setInterval(() => {
        fetcher.load(`/app/export/orders/progress/${job.id}`);
      }, 2000);
    }
    return () => clearInterval(intervalId);
  }, [isPolling, job.id, fetcher]);

  let filters;
  try {
    filters = JSON.parse(job.filters);
  } catch (e) {
    filters = {};
  }

  const expectedCount = filters.expectedCount || 1;
  const progress = job.itemCount > 0 ? (job.itemCount / expectedCount) * 100 : 0;

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed": return <Badge tone="success">Completed</Badge>;
      case "failed": return <Badge tone="critical">Failed</Badge>;
      case "processing": return <Badge tone="attention">Processing</Badge>;
      default: return <Badge>Pending</Badge>;
    }
  };

  return (
    <Page title="Export Progress" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Job Status</Text>
                {getStatusBadge(job.status)}
              </InlineStack>

              <BlockStack gap="200">
                <Text as="p" tone="subdued">
                  Processed {job.itemCount.toLocaleString()} out of ~{expectedCount.toLocaleString()} matching orders.
                </Text>
                
                {isPolling && (
                  <ProgressBar progress={progress} size="small" />
                )}
              </BlockStack>

              {job.status === "completed" && job.fileUrl && (
                <InlineStack align="start">
                  <Button variant="primary" url={`/app/export/download/${job.id}`} external>
                    Download File
                  </Button>
                </InlineStack>
              )}

              {job.status === "failed" && (
                <Text as="p" tone="critical">
                  The export job failed. Please try again.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
