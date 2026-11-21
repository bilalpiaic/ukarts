/** Roles an admin can assign. Labels are what the Role list shows on click. */
export const USER_ROLE_OPTIONS = [
  { value: "USER", label: "User" },
  { value: "ADMIN", label: "Admin" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "INVENTORY_MANAGER", label: "Inventory manager" },
  { value: "PRODUCTION_MANAGER", label: "Production manager" },
  { value: "SALES_USER", label: "Sales user" },
  { value: "VIEWER", label: "Viewer" },
] as const;
