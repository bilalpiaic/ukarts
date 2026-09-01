import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { getOrganization } from "@/lib/erp";
import { ActionForm } from "../action-form";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/");
  const org = await getOrganization();

  return (
    <div className="container">
      <h1 className="page-title">Organization Settings</h1>
      <div className="grid">
        <div className="card">
          <ActionForm
            apiBase="/api/admin"
            action="org-update"
            title="Company Profile"
            submitLabel="Save Settings"
            successText="Organization settings saved."
            fields={[
              { name: "name", label: "Company name", type: "text", default: org?.name ?? "U.K Arts" },
              { name: "address", label: "Address", type: "text", default: org?.address ?? "", required: false },
              { name: "phone", label: "Phone", type: "text", default: org?.phone ?? "", required: false },
              { name: "email", label: "Email", type: "text", default: org?.email ?? "", required: false },
              { name: "tax_id", label: "Tax ID / NTN", type: "text", default: org?.tax_id ?? "", required: false },
              { name: "currency", label: "Currency", type: "text", default: org?.currency ?? "PKR" },
            ]}
          />
        </div>
        <div className="card">
          <h2>About</h2>
          <p className="subtitle">
            These details appear on printed reports and forms. Only administrators
            can change organization settings.
          </p>
        </div>
      </div>
    </div>
  );
}
