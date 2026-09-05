import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { listGreyPurchases, listItems, listParties } from "@/lib/admin";
import { getJournalEntriesList, listAccounts } from "@/lib/erp";
import { money } from "@/lib/format";
import { ActionForm } from "../action-form";
import { AdminEntityTable, ActionButton, DeleteButton } from "../admin-controls";

export const dynamic = "force-dynamic";

export default async function COA() {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/");

  const [accounts, parties, items, purchases, vouchers] = await Promise.all([
    listAccounts(),
    listParties(),
    listItems(),
    listGreyPurchases(),
    getJournalEntriesList(),
  ]);

  return (
    <div className="container">
      <h1 className="page-title">Chart of Accounts &amp; Master Data</h1>

      <div className="grid">
        {/* Chart of Accounts */}
        <div className="card">
          <ActionForm
            apiBase="/api/admin"
            action="account-create"
            title="Add Account"
            submitLabel="Create Account"
            successText="Account created."
            fields={[
              { name: "account_code", label: "Code", type: "text" },
              { name: "account_name", label: "Name", type: "text" },
              {
                name: "account_type",
                label: "Type",
                type: "select",
                options: [
                  { value: "ASSET", label: "Asset" },
                  { value: "LIABILITY", label: "Liability" },
                  { value: "EQUITY", label: "Equity" },
                  { value: "INCOME", label: "Income" },
                  { value: "EXPENSE", label: "Expense" },
                ],
              },
            ]}
          />
        </div>
        <div className="card">
          <h2>Chart of Accounts</h2>
          <AdminEntityTable
            kind="account"
            rows={accounts.map((a) => ({
              id: a.id,
              account_code: a.account_code,
              account_name: a.account_name,
              account_type: a.account_type,
              status: a.status,
            }))}
          />
        </div>

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

        {/* Records — grey purchases */}
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
                        label="Void"
                        confirmText="Void this grey purchase and its postings?"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Records — journal vouchers with post/unpost/delete lifecycle */}
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
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link className="src-link" href={`/vouchers/${v.id}`}>
                        {v.voucher_number}
                      </Link>
                    </td>
                    <td>{v.voucher_date}</td>
                    <td>{v.voucher_type}</td>
                    <td><span className={`pill ${v.status.toLowerCase()}`}>{v.status}</span></td>
                    <td className="num">{money(v.total)}</td>
                    <td>
                      <div className="row-actions">
                        {v.status === "POSTED" && (
                          <ActionButton
                            endpoint="/api/admin/journal-unpost"
                            payload={{ id: v.id }}
                            label="Unpost"
                            confirmText="Unpost this voucher? It returns to DRAFT."
                          />
                        )}
                        {v.status === "DRAFT" && (
                          <DeleteButton
                            endpoint="/api/admin/journal-delete"
                            payload={{ id: v.id }}
                            confirmText="Delete this unposted voucher permanently?"
                          />
                        )}
                      </div>
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
