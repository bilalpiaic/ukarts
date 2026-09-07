import { getOrganization, type Organization } from "@/lib/erp";

export function PrintHeader({
  org,
  title,
  preview = false,
}: {
  org: Organization | null;
  title: string;
  preview?: boolean;
}) {
  const contact = [org?.phone, org?.email].filter(Boolean).join(" · ");
  return (
    <div className={`print-header${preview ? " preview" : ""}`}>
      <div className="print-header-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          className="print-header-logo"
          width={80}
          height={80}
        />
        <div>
          <h2 className="print-header-name">{org?.name ?? "U.K Arts"}</h2>
          {org?.address ? <div>{org.address}</div> : null}
          {contact ? <div>{contact}</div> : null}
          {org?.tax_id ? <div>Tax ID / NTN: {org.tax_id}</div> : null}
        </div>
      </div>
      {org?.about ? <p className="print-about">{org.about}</p> : null}
      <div className="print-header-title">{title}</div>
      <hr />
    </div>
  );
}

export async function PrintOrgHeader({ title }: { title: string }) {
  const org = await getOrganization();
  return <PrintHeader org={org} title={title} />;
}
