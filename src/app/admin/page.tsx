import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import {
  listGreyPurchases,
  listItems,
  listJournalVouchers,
  listParties,
  listUsers,
} from "@/lib/admin";
import { money } from "@/lib/format";
import { ActionForm } from "../action-form";
import { AdminEntityTable, DeleteButton } from "./admin-controls";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/");

  const [parties, items, users, purchases, vouchers] = await Promise.all([
    listParties(),
    listItems(),
    listUsers(),
    listGreyPurchases(),
    listJournalVouchers(),
  ]);

  return (
    <div className="container">
      <h1 className="page-title">Admin — Master Data &amp; Records</h1>

      <div className="grid">
        {/* Parties */}
        <div className="card">
          <ActionForm
            apiBase="/api/admin"
            action="party-create"
            title="Add Party"
            submitLabel="Create Party"
            successText="Party created."
            fields={[
              { name: "party_code", label: "Code", type: "text" },
              { name: "party_name", label: "Name", type: "text" },
              {
                name: "role",
                label: "Role",
                type: "select",
                options: [
                  { value: "CUSTOMER", label: "Customer" },
                  { value: "GREY_SUPPLIER", label: "Grey Supplier" },
                  { value: "PROCESSOR", label: "Processor" },
                  { value: "STITCHER", label: "Stitcher" },
                  { value: "TRANSPORTER", label: "Transporter" },
                ],
              },
              { name: "phone", label: "Phone", type: "text", required: false },
              { name: "email", label: "Email", type: "text", required: false },
            ]}
          />
        </div>
        <div className="card">
          <h2>Parties</h2>
          <AdminEntityTable kind="party" rows={parties} />
        </div>

        {/* Items */}
        <div className="card">
          <ActionForm
            apiBase="/api/admin"
            action="item-create"
            title="Add Item"
            submitLabel="Create Item"
            successText="Item created."
            fields={[
              { name: "item_code", label: "Code", type: "text" },
              { name: "item_name", label: "Name", type: "text" },
              {
                name: "item_type",
                label: "Type",
                type: "select",
                options: [
                  { value: "GREY_CLOTH", label: "Grey cloth" },
                  { value: "PROCESSED_CLOTH", label: "Processed cloth" },
                  { value: "FINISHED_GOOD", label: "Finished good" },
                  { value: "OTHER", label: "Other" },
                ],
              },
              {
                name: "unit_code",
                label: "Unit",
                type: "select",
                options: [
                  { value: "MTR", label: "Meter" },
                  { value: "PCS", label: "Pieces" },
                ],
              },
            ]}
          />
        </div>
        <div className="card">
          <h2>Items</h2>
          <AdminEntityTable kind="item" rows={items} />
        </div>

        {/* Users */}
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
              { name: "password", label: "Password", type: "text" },
            ]}
          />
        </div>
        <div className="card">
          <h2>Users</h2>
          <AdminEntityTable kind="user" rows={users} />
        </div>

        {/* Documents */}
        <div className="card full">
          <h2>Grey Purchases</h2>
          {purchases.length === 0 ? (
            <p className="subtitle">No purchases.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.purchase_number}</td>
                    <td>{p.supplier}</td>
                    <td><span className="pill">{p.status}</span></td>
                    <td className="num">{money(p.total_amount)}</td>
                    <td>
                      <DeleteButton
                        endpoint="/api/admin/document-delete"
                        payload={{ docType: "GREY_PURCHASE", id: p.id }}
                        confirmText="Void this grey purchase and its postings?"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full">
          <h2>Journal Vouchers</h2>
          {vouchers.length === 0 ? (
            <p className="subtitle">No vouchers.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td>{v.voucher_number}</td>
                    <td>{v.voucher_date}</td>
                    <td>{v.voucher_type}</td>
                    <td className="num">{money(v.total)}</td>
                    <td>
                      <DeleteButton
                        endpoint="/api/admin/document-delete"
                        payload={{ docType: "JOURNAL", id: v.id }}
                        confirmText="Void this journal voucher?"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
