import { redirect } from "next/navigation";

/** Workspace is the main menu (multi-tab). Keep this route as a redirect. */
export default function WorkspaceRedirect() {
  redirect("/");
}
