import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/admin";
import { getOrganization } from "@/lib/erp";
import { ActionForm } from "../action-form";
import { AdminEntityTable } from "../admin-controls";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/");
  const [org, users] = await Promise.all([getOrganization(), listUsers()]);

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
              {
                name: "about",
                label: "About",
                type: "textarea",
                rows: 6,
                default: org?.about ?? "",
                required: false,
              },
            ]}
          />
        </div>
        <div className="card">
          <h2>About</h2>
          <div className="brand-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="U.K Arts" className="brand-preview-logo" width={160} height={160} />
            {org?.about ? <p className="print-about">{org.about}</p> : null}
          </div>
        </div>

        <div className="card">
          <ActionForm
            apiBase="/api/admin"
            action="user-create"
            title="Add User"
            submitLabel="Create User"
            successText="User created."
            fields={[
              { name: "username", label: "Username", type: "text" },
              { name: "full_name", label: "Full name", type: "text" },
              {
                name: "role",
                label: "Role",
                type: "select",
                options: [
                  { value: "USER", label: "User" },
                  { value: "ADMIN", label: "Admin" },
                  { value: "ACCOUNTANT", label: "Accountant" },
                  { value: "VIEWER", label: "Viewer" },
                ],
              },
              { name: "password", label: "Password", type: "password" },
            ]}
          />
        </div>
        <div className="card">
          <h2>Login accounts</h2>
          <p className="subtitle">
            Usernames and password changes are managed here. Stored passwords are
            hashed and cannot be read back. Use <strong>Change password</strong> to
            set or reset access. This information is never shown on the public
            sign-in page.
          </p>
          {users.length === 0 ? (
            <p className="subtitle">No users yet.</p>
          ) : (
            <AdminEntityTable kind="user" rows={users} />
          )}
        </div>
      </div>
    </div>
  );
}
