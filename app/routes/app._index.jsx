import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  Badge,
  ProgressBar,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Fetch recent jobs
  const importJobs = await prisma.importJob.findMany({
    where: { shopId: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const exportJobs = await prisma.exportJob.findMany({
    where: { shopId: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Combine and sort by createdAt desc
  const allJobs = [...importJobs.map(j => ({ ...j, type: "Import" })), ...exportJobs.map(j => ({ ...j, type: "Export" }))]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  return { jobs: allJobs };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "import") {
    const job = await prisma.importJob.create({
      data: {
        shopId: session.shop,
        fileUrl: "dummy-url", // Placeholder for actual file upload
        status: "pending",
        options: JSON.stringify({}),
      },
    });
    return { success: true, job };
  }

  if (actionType === "export") {
    const job = await prisma.exportJob.create({
      data: {
        shopId: session.shop,
        status: "pending",
        format: "xlsx",
        filters: JSON.stringify({}),
      },
    });
    return { success: true, job };
  }

  return { error: "Unknown action" };
};

export default function Index() {
  const { jobs } = useLoaderData();
  const fetcher = useFetcher();
  const isPolling = jobs.some((j) => j.status === "pending" || j.status === "processing");

  useEffect(() => {
    let intervalId;
    if (isPolling) {
      intervalId = setInterval(() => {
        fetcher.load("/app");
      }, 2000); // Poll every 2 seconds if jobs are active
    }
    return () => clearInterval(intervalId);
  }, [isPolling, fetcher]);

  const displayedJobs = fetcher.data?.jobs || jobs;
  const isLoading = fetcher.state !== "idle";

  const handleCreateJob = (type) => {
    fetcher.submit({ actionType: type }, { method: "POST" });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
        return <Badge tone="success">Completed</Badge>;
      case "processing":
        return <Badge tone="attention">Processing</Badge>;
      case "failed":
        return <Badge tone="critical">Failed</Badge>;
      case "pending":
      default:
        return <Badge>Pending</Badge>;
    }
  };

  return (
    <Page title="Orders Sync Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Import & Export Orders
              </Text>
              <Text as="p" variant="bodyMd">
                Manage your orders via spreadsheets (XLSX/CSV). Create, update, replace, merge, or delete orders using our bulk import tool, or export your existing orders.
              </Text>
              <InlineStack gap="300">
                <Button onClick={() => handleCreateJob("import")} loading={isLoading && fetcher.formData?.get("actionType") === "import"} variant="primary">
                  Import Orders
                </Button>
                <Button onClick={() => handleCreateJob("export")} loading={isLoading && fetcher.formData?.get("actionType") === "export"}>
                  Export Orders
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Recent Jobs
              </Text>

              {displayedJobs.length === 0 ? (
                <EmptyState heading="No jobs yet" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                  <p>Run your first import or export to see it here.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {displayedJobs.map((job) => {
                    const isImport = job.type === "Import";
                    const progress = isImport
                      ? job.totalRows > 0
                        ? (job.processedRows / job.totalRows) * 100
                        : 0
                      : job.itemCount > 0
                        ? 100 // Export doesn't have a total upfront usually, just item count
                        : 0;

                    return (
                      <Box key={job.id} paddingBlockEnd="200" borderBlockEndWidth="025" borderColor="border">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <Text as="h3" variant="headingSm">
                              {job.type} Job
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {new Date(job.createdAt).toLocaleString()}
                            </Text>
                          </BlockStack>
                          <InlineStack gap="300" blockAlign="center">
                            {job.status === "processing" && (
                              <Box minWidth="100px">
                                <ProgressBar progress={progress} size="small" />
                              </Box>
                            )}
                            {getStatusBadge(job.status)}
                            <Button 
                              url={isImport ? `/app/import/orders/summary/${job.id}` : `/app/export/orders/progress/${job.id}`} 
                              variant="plain"
                            >
                              View Details
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
