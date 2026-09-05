export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 5;

export const ALLOWED_EXT = [
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "mp3",
] as const;

export type AllowedExt = (typeof ALLOWED_EXT)[number];

export const ACCEPT_ATTR = ALLOWED_EXT.map((e) => `.${e}`).join(",");

/** Map a posting action to the document the files should hang off. */
export const ACTION_ATTACH: Record<
  string,
  { entityType: string; idKey: string; idFrom: "response" | "payload" }
> = {
  "grey-purchase": { entityType: "GREY_PURCHASE", idKey: "purchaseId", idFrom: "response" },
  "sale-order": { entityType: "SALE_ORDER", idKey: "saleOrderId", idFrom: "response" },
  "production-order": { entityType: "PRODUCTION_ORDER", idKey: "productionOrderId", idFrom: "response" },
  "processing-bill": { entityType: "PROCESSING_BILL", idKey: "billId", idFrom: "response" },
  "stitching-bill": { entityType: "STITCHING_BILL", idKey: "billId", idFrom: "response" },
  "dispatch-sale": { entityType: "SALE_ORDER", idKey: "saleOrderId", idFrom: "payload" },
};
