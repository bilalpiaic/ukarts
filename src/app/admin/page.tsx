import { redirect } from "next/navigation";

// The former Admin page is now the Chart of Accounts (COA) workspace.
export default function AdminRedirect() {
  redirect("/coa");
}
