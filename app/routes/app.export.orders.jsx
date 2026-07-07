import { useState } from "react";
import { useSubmit, useActionData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  ChoiceList,
  TextField,
  Button,
  InlineStack,
  Checkbox,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { buildSearchQuery } from "../services/order-export-query.server";
import { ORDER_COLUMNS as ALL_COLUMNS } from "../constants/order-columns.server";

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const format = formData.get("format");
  const rowMode = formData.get("rowMode");
  const confirmedLargeExport = formData.get("confirmedLargeExport") === "true";
  
  const selectedColumns = formData.getAll("columns");
  
  const filters = {
    financialStatus: formData.get("financialStatus") || "",
    fulfillmentStatus: formData.get("fulfillmentStatus") || "",
    tags: formData.get("tags") || "",
    dateMin: formData.get("dateMin") || "",
    dateMax: formData.get("dateMax") || "",
  };

  const queryStr = buildSearchQuery(filters);

  // Check count
  const countResponse = await admin.graphql(
    `#graphql
    query getOrdersCount($query: String) {
      ordersCount(query: $query) {
        count
      }
    }`,
    { variables: { query: queryStr } }
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

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/app/export/orders/progress/${job.id}`,
    },
  });
};

export default function ExportOrders() {
  const submit = useSubmit();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [format, setFormat] = useState(["xlsx"]);
  const [rowMode, setRowMode] = useState(["lineItem"]);
  const [columns, setColumns] = useState(ALL_COLUMNS);
  
  const [financialStatus, setFinancialStatus] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [tags, setTags] = useState("");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  
  const [confirmedLargeExport, setConfirmedLargeExport] = useState(false);

  const handleExport = () => {
    const formData = new FormData();
    formData.append("format", format[0]);
    formData.append("rowMode", rowMode[0]);
    formData.append("financialStatus", financialStatus);
    formData.append("fulfillmentStatus", fulfillmentStatus);
    formData.append("tags", tags);
    formData.append("dateMin", dateMin);
    formData.append("dateMax", dateMax);
    columns.forEach(c => formData.append("columns", c));

    if (confirmedLargeExport) {
      formData.append("confirmedLargeExport", "true");
    }

    submit(formData, { method: "post" });
  };

  const isLargeExportError = actionData?.error === "large_export";

  return (
    <Page title="Export Orders" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        {isLargeExportError && (
          <Layout.Section>
            <Banner tone="warning" title="Large Export Detected">
              <p>Your filters match {actionData?.count?.toLocaleString()} orders. This is a very large export and will take a long time.</p>
              <div style={{ marginTop: '10px' }}>
                <Checkbox
                  label="I confirm I want to export more than 200,000 orders."
                  checked={confirmedLargeExport}
                  onChange={setConfirmedLargeExport}
                />
              </div>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Export Settings</Text>
              
              <InlineStack gap="400">
                <ChoiceList
                  title="Format"
                  choices={[
                    { label: "Excel (.xlsx)", value: "xlsx" },
                    { label: "CSV (.csv)", value: "csv" },
                  ]}
                  selected={format}
                  onChange={setFormat}
                />
                
                <ChoiceList
                  title="Row Layout"
                  choices={[
                    { label: "One row per Order", value: "order", helpText: "Line items will be ignored/merged" },
                    { label: "One row per Line Item", value: "lineItem", helpText: "Order fields repeat for each item" },
                  ]}
                  selected={rowMode}
                  onChange={setRowMode}
                />
              </InlineStack>

            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Columns</Text>
              <ChoiceList
                allowMultiple
                title="Select columns to export"
                titleHidden
                choices={ALL_COLUMNS.map(c => ({ label: c, value: c }))}
                selected={columns}
                onChange={setColumns}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Filters</Text>
              <InlineStack gap="400" wrap={false}>
                <TextField label="Financial Status" value={financialStatus} onChange={setFinancialStatus} placeholder="e.g. paid, pending" autoComplete="off" />
                <TextField label="Fulfillment Status" value={fulfillmentStatus} onChange={setFulfillmentStatus} placeholder="e.g. fulfilled, unfulfilled" autoComplete="off" />
                <TextField label="Tags" value={tags} onChange={setTags} placeholder="e.g. wholesale" autoComplete="off" />
              </InlineStack>
              <InlineStack gap="400" wrap={false}>
                <TextField type="date" label="Date Min (Created At)" value={dateMin} onChange={setDateMin} autoComplete="off" />
                <TextField type="date" label="Date Max (Created At)" value={dateMax} onChange={setDateMax} autoComplete="off" />
              </InlineStack>

              <InlineStack align="end">
                <Button 
                  variant="primary" 
                  onClick={handleExport} 
                  loading={isSubmitting}
                  disabled={isLargeExportError && !confirmedLargeExport}
                >
                  Start Export
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
