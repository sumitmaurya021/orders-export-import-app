import prisma from "../db.server";
import { rateLimiter } from "./shopify-rate-limiter.server";
import { parseOrderFile } from "./order-file-parser.server";
import { groupOrderRows } from "./order-row-grouper.server";
import { processOrderRowGroup } from "./order-processor.server";
import shopify from "../shopify.server";
import { buildExportQuery } from "./order-export-query.server";
import * as xlsx from "xlsx";
import fs from "fs";
import path from "path";

class JobRunner {
  constructor() {
    this.isPolling = false;
    this.pollInterval = 5000;
  }

  start() {
    if (this.isPolling) return;
    this.isPolling = true;
    console.log("[JobRunner] Started DB polling for pending jobs...");
    this.poll();
  }

  stop() {
    this.isPolling = false;
  }

  async poll() {
    if (!this.isPolling) return;

    try {
      const pendingImport = await prisma.importJob.findFirst({
        where: { status: "pending" },
      });

      if (pendingImport) {
        await this.processImportJob(pendingImport);
      }

      const pendingExport = await prisma.exportJob.findFirst({
        where: { status: "pending" },
      });

      if (pendingExport) {
        await this.processExportJob(pendingExport);
      }

    } catch (error) {
      console.error("[JobRunner] Error during polling:", error);
    }

    setTimeout(() => this.poll(), this.pollInterval);
  }

  async processImportJob(job) {
    console.log(`[JobRunner] Processing Import Job: ${job.id}`);
    
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "processing", startedAt: new Date() }
    });

    try {
      const { admin } = await shopify.unauthenticated.admin(job.shopId);
      const analysis = await parseOrderFile(job.fileUrl);
      const rows = analysis.rows;
      
      const groups = groupOrderRows(rows);
      
      let processedRowsCounter = 0;
      let errorCount = 0;
      let warningCount = 0;

      // We'll keep track of results to annotate the original rows
      const groupResults = new Map(); // identifier -> { result, comment }

      const createLogger = (groupIdentifier) => ({
        info: async (message) => {
          console.log(`[Import Info] ${groupIdentifier}: ${message}`);
          groupResults.set(groupIdentifier, { result: "Success", comment: message });
          await prisma.jobLog.create({
            data: { jobId: job.id, jobType: "import", level: "info", message: `[${groupIdentifier}] ${message}` }
          });
        },
        warning: async (message) => {
          console.warn(`[Import Warning] ${groupIdentifier}: ${message}`);
          warningCount++;
          groupResults.set(groupIdentifier, { result: "Warning", comment: message });
          await prisma.jobLog.create({
            data: { jobId: job.id, jobType: "import", level: "warning", message: `[${groupIdentifier}] ${message}` }
          });
        },
        error: async (message) => {
          console.error(`[Import Error] ${groupIdentifier}: ${message}`);
          errorCount++;
          groupResults.set(groupIdentifier, { result: "Error", comment: message });
          await prisma.jobLog.create({
            data: { jobId: job.id, jobType: "import", level: "error", message: `[${groupIdentifier}] ${message}` }
          });
        }
      });

      const jobOptions = job.options ? JSON.parse(job.options) : {};

      for (const group of groups) {
        const logger = createLogger(group.identifier);
        const rowCountForGroup = group.lineItems.length > 0 ? group.lineItems.length : 1;
        
        await processOrderRowGroup(group, admin, logger, jobOptions);
        processedRowsCounter += rowCountForGroup;

        await prisma.importJob.update({
          where: { id: job.id },
          data: { processedRows: processedRowsCounter, errorCount, warningCount }
        });
      }

      // Generate Annotated File
      const annotatedRows = rows.map(row => {
        const id = row["ID"] ? String(row["ID"]).trim() : null;
        const name = row["Name"] ? String(row["Name"]).trim() : null;
        const identifier = id || name;
        
        const annotation = groupResults.get(identifier) || { result: "Skipped", comment: "No matching group processed" };
        
        return {
          ...row,
          "Import Result": annotation.result,
          "Import Comment": annotation.comment
        };
      });

      const ws = xlsx.utils.json_to_sheet(annotatedRows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Orders");
      const annotatedFileName = `annotated-import-${job.id}.xlsx`;
      const annotatedFilePath = path.join(process.cwd(), "tmp", annotatedFileName);
      xlsx.writeFile(wb, annotatedFilePath);

      // Save annotated file path in options
      const existingOptions = job.options ? JSON.parse(job.options) : {};
      existingOptions.annotatedFileUrl = annotatedFilePath;

      await prisma.importJob.update({
        where: { id: job.id },
        data: { 
          status: "completed", 
          completedAt: new Date(),
          options: JSON.stringify(existingOptions)
        }
      });
      console.log(`[JobRunner] Import Job ${job.id} completed.`);

    } catch (error) {
      console.error(`[JobRunner] Import Job ${job.id} failed:`, error);
      await prisma.importJob.update({
        where: { id: job.id },
        data: { status: "failed", completedAt: new Date() }
      });
      await prisma.jobLog.create({
        data: { jobId: job.id, jobType: "import", level: "error", message: `Fatal Error: ${error.message}` }
      });
    }
  }

  async processExportJob(job) {
    console.log(`[JobRunner] Processing Export Job: ${job.id}`);
    
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "processing", startedAt: new Date() }
    });

    try {
      const { admin } = await shopify.unauthenticated.admin(job.shopId);
      const filters = JSON.parse(job.filters);
      const queryStr = filters.query;
      const columns = filters.columns;
      const rowMode = filters.rowMode; 

      const graphqlQuery = buildExportQuery(columns);
      let hasNextPage = true;
      let cursor = null;
      let itemCount = 0;
      let allRows = [];

      while (hasNextPage) {
        const response = await rateLimiter.withRetry(async () => {
          return await admin.graphql(graphqlQuery, { 
            variables: { first: 50, cursor, query: queryStr || undefined } 
          });
        });

        const orders = response.data?.orders?.edges || [];
        const pageInfo = response.data?.orders?.pageInfo;

        for (const edge of orders) {
          const order = edge.node;
          itemCount++;

          const baseRow = {};
          if (columns.includes("ID")) baseRow["ID"] = order.id;
          if (columns.includes("Name")) baseRow["Name"] = order.name;
          if (columns.includes("Email")) baseRow["Email"] = order.email || "";
          if (columns.includes("Financial Status")) baseRow["Financial Status"] = order.displayFinancialStatus || "";
          if (columns.includes("Fulfillment Status")) baseRow["Fulfillment Status"] = order.displayFulfillmentStatus || "";
          if (columns.includes("Currency")) baseRow["Currency"] = order.currencyCode || "";
          if (columns.includes("Tags")) baseRow["Tags"] = (order.tags || []).join(", ");
          if (columns.includes("Note")) baseRow["Note"] = order.note || "";
          if (columns.includes("Command")) baseRow["Command"] = "MERGE"; // Default command for re-import parity

          const lineItems = order.lineItems?.edges || [];

          if (rowMode === "lineItem" && lineItems.length > 0) {
            for (const liEdge of lineItems) {
              const li = liEdge.node;
              const row = { ...baseRow };
              if (columns.includes("Line Item: SKU")) row["Line Item: SKU"] = li.sku || "";
              if (columns.includes("Line Item: Title")) row["Line Item: Title"] = li.title || "";
              if (columns.includes("Line Item: Quantity")) row["Line Item: Quantity"] = li.quantity || 0;
              if (columns.includes("Line Item: Price")) row["Line Item: Price"] = li.originalUnitPriceSet?.presentmentMoney?.amount || "0.00";
              if (columns.includes("Line Item: Command")) row["Line Item: Command"] = ""; 
              allRows.push(row);
            }
          } else {
            if (rowMode === "order" && lineItems.length > 0) {
              const li = lineItems[0].node;
              if (columns.includes("Line Item: SKU")) baseRow["Line Item: SKU"] = li.sku || "";
              if (columns.includes("Line Item: Title")) baseRow["Line Item: Title"] = li.title || "";
              if (columns.includes("Line Item: Quantity")) baseRow["Line Item: Quantity"] = li.quantity || 0;
              if (columns.includes("Line Item: Price")) baseRow["Line Item: Price"] = li.originalUnitPriceSet?.presentmentMoney?.amount || "0.00";
              if (columns.includes("Line Item: Command")) baseRow["Line Item: Command"] = ""; 
            }
            allRows.push(baseRow);
          }
        }

        hasNextPage = pageInfo?.hasNextPage || false;
        cursor = pageInfo?.endCursor || null;

        await prisma.exportJob.update({
          where: { id: job.id },
          data: { itemCount }
        });
      }

      const ws = xlsx.utils.json_to_sheet(allRows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Orders");
      
      const fileName = `export-${job.id}.${job.format}`;
      const filePath = path.join(process.cwd(), "tmp", fileName);
      
      if (job.format === "csv") {
        const csvData = xlsx.utils.sheet_to_csv(ws);
        fs.writeFileSync(filePath, csvData);
      } else {
        xlsx.writeFile(wb, filePath);
      }

      await prisma.exportJob.update({
        where: { id: job.id },
        data: { status: "completed", completedAt: new Date(), itemCount, fileUrl: filePath }
      });
      console.log(`[JobRunner] Export Job ${job.id} completed.`);

    } catch (error) {
      console.error(`[JobRunner] Export Job ${job.id} failed:`, error);
      await prisma.exportJob.update({
        where: { id: job.id },
        data: { status: "failed", completedAt: new Date() }
      });
    }
  }
}

global.__jobRunner = global.__jobRunner || new JobRunner();
export const jobRunner = global.__jobRunner;
